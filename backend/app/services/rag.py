"""Retrieval-augmented generation over the indexed codebase."""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import Runnable
from langchain_ollama import ChatOllama

from app.core.config import settings
from app.core.logging import get_logger
from app.db.chroma import count_documents, get_vector_store
from app.services.hybrid_search import hybrid_search
from app.services.prompts import RAG_PROMPT_TEMPLATE

logger = get_logger(__name__)

# Marker the frontend splits on to render the "sources" panel. Keep this in sync
# with `frontend/app/lib/citations.ts`.
SOURCES_START = "<!--codescope:sources-->"
SOURCES_END = "<!--/codescope:sources-->"

# Cap the context so a long repository cannot blow past the model's window.
MAX_CONTEXT_CHARS = 12_000


@lru_cache(maxsize=1)
def get_llm() -> ChatOllama:
    """Return the shared Ollama chat model."""
    logger.info(
        "Using Ollama model %s at %s", settings.OLLAMA_MODEL, settings.OLLAMA_BASE_URL
    )
    return ChatOllama(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        temperature=settings.OLLAMA_TEMPERATURE,
        # Without these two Ollama uses a 4096-token window and an unbounded
        # reply, so a grounded prompt plus its answer ran past the end of the
        # window and the response stopped mid-sentence.
        num_ctx=settings.OLLAMA_NUM_CTX,
        num_predict=settings.OLLAMA_NUM_PREDICT,
        # Hybrid reasoning models (qwen3.5 among them) put their thinking in a
        # separate channel. Left enabled, a question could stream hundreds of
        # tokens of reasoning and arrive with an empty visible answer.
        reasoning=settings.OLLAMA_REASONING,
        client_kwargs={"timeout": settings.OLLAMA_TIMEOUT_SECONDS},
    )


def build_context(documents: list[Document]) -> str:
    """Concatenate retrieved chunks into a labelled context block.

    Each chunk is prefixed with its path so the model can cite precisely, and
    the total is capped at :data:`MAX_CONTEXT_CHARS`.
    """
    parts: list[str] = []
    budget = MAX_CONTEXT_CHARS

    for index, document in enumerate(documents, 1):
        path = document.metadata.get("relative_path") or document.metadata.get(
            "filename", "unknown"
        )
        language = document.metadata.get("language", "")
        block = (
            f"--- [{index}] {path} ---\n"
            f"```{language}\n{document.page_content.strip()}\n```"
        )
        if len(block) > budget:
            break
        parts.append(block)
        budget -= len(block)

    return "\n\n".join(parts)


def collect_sources(documents: list[Document]) -> list[dict[str, str]]:
    """Deduplicate retrieved chunks down to one entry per source file."""
    seen: dict[str, dict[str, str]] = {}
    for document in documents:
        metadata = document.metadata
        path = str(metadata.get("relative_path") or metadata.get("source", "unknown"))
        if path in seen:
            continue
        seen[path] = {
            "path": path,
            "filename": str(metadata.get("filename", path.split("/")[-1])),
            "language": str(metadata.get("language", "unknown")),
            "absolute_path": str(metadata.get("source", "")),
        }
    return list(seen.values())


def _render_sources_block(sources: list[dict[str, str]]) -> str:
    """Render the citation block the frontend parses out of the stream.

    Rows are ``index|filename|language|relative_path|absolute_path``. The
    absolute path lets the UI open the file in its viewer.
    """
    lines = [SOURCES_START]
    for index, source in enumerate(sources, 1):
        lines.append(
            f"{index}|{source['filename']}|{source['language']}"
            f"|{source['path']}|{source['absolute_path']}"
        )
    lines.append(SOURCES_END)
    return "\n".join(lines) + "\n\n"


def _build_chain() -> Runnable[dict[str, str], str]:
    """Assemble the prompt-to-text chain used to answer a question."""
    prompt = PromptTemplate(
        template=RAG_PROMPT_TEMPLATE, input_variables=["context", "question"]
    )
    return prompt | get_llm() | StrOutputParser()


def _retrieve(query: str) -> list[Document]:
    """Fetch relevant chunks, degrading to pure vector search on failure."""
    vector_store = get_vector_store()
    try:
        documents = hybrid_search(query, vector_store, k=settings.RETRIEVAL_TOP_K)
        logger.info("Hybrid search returned %s chunks", len(documents))
        return documents
    except Exception:
        logger.exception("Hybrid search failed; falling back to semantic-only search")
        return vector_store.similarity_search(query, k=settings.RETRIEVAL_TOP_K)


async def chat_stream(query: str) -> AsyncIterator[str]:
    """Stream a grounded answer for ``query`` chunk by chunk.

    The stream begins with a machine-readable citation block, followed by the
    model's answer. Errors are surfaced as readable text rather than a broken
    connection, because the response has already started by then.
    """
    if count_documents() == 0:
        logger.warning("Chat requested but no repository has been indexed")
        yield (
            "**No repository indexed yet.**\n\n"
            "Open the settings dialog, point CodeScope at a local repository and "
            "wait for indexing to finish, then ask your question again."
        )
        return

    try:
        documents = _retrieve(query)
    except Exception as exc:
        logger.exception("Retrieval failed")
        yield f"**Retrieval failed:** {exc}\n\nTry re-indexing the repository."
        return

    if not documents:
        yield (
            "**No relevant code found for that question.**\n\n"
            "Try rephrasing it, or check that the repository finished indexing."
        )
        return

    yield _render_sources_block(collect_sources(documents))

    try:
        chain = _build_chain()
        async for token in chain.astream(
            {"context": build_context(documents), "question": query}
        ):
            yield token
    except Exception as exc:
        logger.exception("LLM streaming failed")
        yield _format_llm_error(exc)


def _format_llm_error(exc: Exception) -> str:
    """Turn an LLM transport failure into actionable guidance."""
    message = str(exc)
    connection_failure = any(
        marker in message
        for marker in (
            "Cannot connect",
            "Connection refused",
            "ConnectError",
            "Failed to establish",
            "getaddrinfo",
        )
    )

    if connection_failure:
        return (
            "\n\n**Ollama is not reachable.**\n\n"
            f"CodeScope expected it at `{settings.OLLAMA_BASE_URL}`.\n\n"
            "1. Install Ollama from [ollama.com](https://ollama.com)\n"
            f"2. Pull the model: `ollama pull {settings.OLLAMA_MODEL}`\n"
            "3. Make sure `ollama serve` is running, then retry.\n"
        )

    if "not found" in message.lower() and "model" in message.lower():
        return (
            f"\n\n**Model `{settings.OLLAMA_MODEL}` is not installed.**\n\n"
            f"Run `ollama pull {settings.OLLAMA_MODEL}` and try again.\n"
        )

    return f"\n\n**The language model returned an error:** {message}\n"
