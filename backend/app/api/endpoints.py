"""Ingestion, chat and search endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.schemas import (
    ChatRequest,
    IngestRequest,
    SearchMatch,
    SearchRequest,
    SearchResponse,
)
from app.core.logging import get_logger
from app.core.paths import PathValidationError, resolve_user_path
from app.services.code_search import (
    InvalidPatternError,
    fuzzy_search,
    regex_search,
)
from app.services.ingestion import ingest_repository_stream
from app.services.rag import chat_stream

logger = get_logger(__name__)

router = APIRouter()

# Streaming responses must not be buffered by an intermediate proxy, otherwise
# progress output only appears once the whole request finishes.
STREAM_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
}


def _resolve_repo(raw_path: str):
    """Resolve a repository path or raise the matching HTTP error."""
    try:
        path = resolve_user_path(raw_path)
    except PathValidationError as exc:
        message = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in message.lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(code, message) from exc

    if not path.is_dir():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Repository path is not a directory"
        )
    return path


@router.post("/ingest")
async def ingest_endpoint(request: IngestRequest) -> StreamingResponse:
    """Index a local repository, streaming progress as plain text."""
    repo = _resolve_repo(request.repo_path)
    logger.info("Ingest requested for %s", repo)

    return StreamingResponse(
        ingest_repository_stream(repo),
        media_type="text/plain; charset=utf-8",
        headers=STREAM_HEADERS,
    )


@router.post("/chat")
async def chat_endpoint(request: ChatRequest) -> StreamingResponse:
    """Answer a question about the indexed codebase, streaming the response."""
    preview = request.message[:80]
    logger.info(
        "Chat requested: %s%s", preview, "..." if len(request.message) > 80 else ""
    )

    return StreamingResponse(
        chat_stream(request.message),
        media_type="text/plain; charset=utf-8",
        headers=STREAM_HEADERS,
    )


@router.post("/search/regex", response_model=SearchResponse)
async def regex_search_endpoint(request: SearchRequest) -> SearchResponse:
    """Search the repository with a regular expression."""
    repo = _resolve_repo(request.repo_path)

    try:
        results, truncated = regex_search(
            request.query, repo, max_results=request.max_results
        )
    except InvalidPatternError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except OSError as exc:
        logger.exception("Regex search failed")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Search failed while reading files"
        ) from exc

    return SearchResponse(
        results=[SearchMatch(**result.to_dict()) for result in results],
        total_matches=len(results),
        query=request.query,
        search_type="regex",
        truncated=truncated,
    )


@router.post("/search/fuzzy", response_model=SearchResponse)
async def fuzzy_search_endpoint(request: SearchRequest) -> SearchResponse:
    """Search the repository with typo-tolerant fuzzy matching."""
    repo = _resolve_repo(request.repo_path)

    try:
        results, truncated = fuzzy_search(
            request.query,
            repo,
            threshold=request.threshold,
            max_results=request.max_results,
        )
    except OSError as exc:
        logger.exception("Fuzzy search failed")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Search failed while reading files"
        ) from exc

    return SearchResponse(
        results=[SearchMatch(**result.to_dict()) for result in results],
        total_matches=len(results),
        query=request.query,
        search_type="fuzzy",
        truncated=truncated,
        threshold=request.threshold,
    )
