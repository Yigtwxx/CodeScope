"""Tests for context assembly, citation rendering and the chat stream.

No Ollama process and no vector store are involved; retrieval and generation
are both stubbed at their module boundaries.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from langchain_core.documents import Document

from app.services import rag


def chunk(path: str, content: str = "code", language: str = "python") -> Document:
    return Document(
        page_content=content,
        metadata={
            "relative_path": path,
            "source": f"C:/repo/{path}",
            "filename": path.split("/")[-1],
            "language": language,
        },
    )


async def collect(stream: AsyncIterator[str]) -> str:
    return "".join([token async for token in stream])


# --- Context assembly ---------------------------------------------------------


def test_build_context_labels_each_chunk_with_its_path() -> None:
    context = rag.build_context([chunk("src/auth.py"), chunk("src/db.py")])

    assert "--- [1] src/auth.py ---" in context
    assert "--- [2] src/db.py ---" in context


def test_build_context_fences_chunks_with_their_language() -> None:
    context = rag.build_context([chunk("src/app.ts", language="typescript")])

    assert "```typescript" in context


def test_build_context_stops_at_the_character_budget() -> None:
    oversized = chunk("big.py", content="x" * (rag.MAX_CONTEXT_CHARS + 1))

    assert rag.build_context([oversized]) == ""


def test_build_context_keeps_the_chunks_that_fit() -> None:
    small = chunk("small.py", content="y" * 100)
    oversized = chunk("big.py", content="x" * rag.MAX_CONTEXT_CHARS)

    context = rag.build_context([small, oversized])

    assert "small.py" in context
    assert "big.py" not in context


def test_build_context_of_nothing_is_empty() -> None:
    assert rag.build_context([]) == ""


# --- Citations ----------------------------------------------------------------


def test_collect_sources_deduplicates_chunks_from_one_file() -> None:
    sources = rag.collect_sources([chunk("src/auth.py"), chunk("src/auth.py")])

    assert len(sources) == 1, f"Expected a single source, got {sources}"


def test_collect_sources_preserves_retrieval_order() -> None:
    sources = rag.collect_sources([chunk("b.py"), chunk("a.py")])

    assert [source["path"] for source in sources] == ["b.py", "a.py"]


def test_collect_sources_carries_the_absolute_path() -> None:
    (source,) = rag.collect_sources([chunk("src/auth.py")])

    assert source["absolute_path"] == "C:/repo/src/auth.py"


def test_sources_block_is_delimited_and_one_row_per_file() -> None:
    block = rag._render_sources_block(rag.collect_sources([chunk("src/auth.py")]))

    assert block.startswith(rag.SOURCES_START)
    assert rag.SOURCES_END in block

    body = block.split(rag.SOURCES_START)[1].split(rag.SOURCES_END)[0]
    rows = [line for line in body.splitlines() if line]
    assert rows == ["1|auth.py|python|src/auth.py|C:/repo/src/auth.py"]


# --- Chat stream --------------------------------------------------------------


async def test_chat_without_an_index_explains_how_to_index(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rag, "count_documents", lambda: 0)

    answer = await collect(rag.chat_stream("how does auth work"))

    assert "No repository indexed" in answer


async def test_chat_reports_a_retrieval_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rag, "count_documents", lambda: 5)

    def explode(_query: str) -> list[Document]:
        raise RuntimeError("collection is corrupt")

    monkeypatch.setattr(rag, "_retrieve", explode)

    answer = await collect(rag.chat_stream("how does auth work"))

    assert "Retrieval failed" in answer
    assert "collection is corrupt" in answer


async def test_chat_says_so_when_nothing_matches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rag, "count_documents", lambda: 5)
    monkeypatch.setattr(rag, "_retrieve", lambda _query: [])

    answer = await collect(rag.chat_stream("how does auth work"))

    assert "No relevant code found" in answer


async def test_chat_emits_citations_before_the_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rag, "count_documents", lambda: 5)
    monkeypatch.setattr(rag, "_retrieve", lambda _query: [chunk("src/auth.py")])

    class FakeChain:
        async def astream(self, _payload: dict[str, str]) -> AsyncIterator[str]:
            for token in ("Auth ", "lives in auth.py."):
                yield token

    monkeypatch.setattr(rag, "_build_chain", lambda: FakeChain())

    answer = await collect(rag.chat_stream("how does auth work"))

    assert answer.index(rag.SOURCES_END) < answer.index("Auth ")
    assert answer.endswith("Auth lives in auth.py.")


async def test_chat_turns_a_streaming_failure_into_guidance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rag, "count_documents", lambda: 5)
    monkeypatch.setattr(rag, "_retrieve", lambda _query: [chunk("src/auth.py")])

    class FailingChain:
        async def astream(self, _payload: dict[str, str]) -> AsyncIterator[str]:
            raise ConnectionError("Cannot connect to host localhost:11434")
            yield ""  # pragma: no cover - unreachable, marks this a generator

    monkeypatch.setattr(rag, "_build_chain", lambda: FailingChain())

    answer = await collect(rag.chat_stream("how does auth work"))

    assert "Ollama is not reachable" in answer


# --- Error formatting ---------------------------------------------------------


@pytest.mark.parametrize(
    "message",
    [
        "Cannot connect to host",
        "Connection refused",
        "ConnectError",
        "Failed to establish a new connection",
        "getaddrinfo failed",
    ],
)
def test_transport_failures_are_reported_as_ollama_being_down(message: str) -> None:
    assert "Ollama is not reachable" in rag._format_llm_error(RuntimeError(message))


def test_a_missing_model_is_reported_as_such() -> None:
    formatted = rag._format_llm_error(RuntimeError('model "llama3" not found'))

    assert "is not installed" in formatted
    assert "ollama pull" in formatted


def test_an_unrecognised_failure_is_passed_through() -> None:
    formatted = rag._format_llm_error(RuntimeError("context length exceeded"))

    assert "context length exceeded" in formatted


# --- Model configuration ------------------------------------------------------


def test_llm_is_configured_with_an_explicit_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ollama's default 4096-token window truncated grounded answers."""
    from app.core.config import settings

    rag.get_llm.cache_clear()
    monkeypatch.setattr(settings, "OLLAMA_NUM_CTX", 8192)
    monkeypatch.setattr(settings, "OLLAMA_NUM_PREDICT", 1024)

    llm = rag.get_llm()
    rag.get_llm.cache_clear()

    assert llm.num_ctx == 8192, "the context window must be set explicitly"
    assert llm.num_predict == 1024, "the reply must be bounded"


def test_reasoning_is_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """A hybrid reasoning model streams its thinking on a channel the UI never
    renders, which arrived as a blank answer."""
    rag.get_llm.cache_clear()

    llm = rag.get_llm()
    rag.get_llm.cache_clear()

    assert llm.reasoning is False


def test_llm_honours_the_configured_model_and_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import settings

    rag.get_llm.cache_clear()
    monkeypatch.setattr(settings, "OLLAMA_MODEL", "some-model:1b")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://elsewhere:9999")

    llm = rag.get_llm()
    rag.get_llm.cache_clear()

    assert llm.model == "some-model:1b"
    assert llm.base_url == "http://elsewhere:9999"
