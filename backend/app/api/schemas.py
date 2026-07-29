"""Request and response models shared by the API routers."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# --- Requests -----------------------------------------------------------------


class IngestRequest(BaseModel):
    """Body of ``POST /api/ingest``."""

    repo_path: str = Field(
        ..., min_length=1, description="Absolute path to a repository"
    )


class ChatRequest(BaseModel):
    """Body of ``POST /api/chat``."""

    message: str = Field(..., min_length=1, max_length=8000)


class SearchRequest(BaseModel):
    """Body of the regex and fuzzy search endpoints."""

    query: str = Field(..., min_length=1, max_length=500)
    repo_path: str = Field(..., min_length=1)
    threshold: int = Field(70, ge=0, le=100, description="Fuzzy matching cut-off")
    max_results: int = Field(100, ge=1, le=500)


class PathRequest(BaseModel):
    """Body of the file browsing endpoints."""

    path: str = Field(..., min_length=1)


# --- Responses ----------------------------------------------------------------


class HealthResponse(BaseModel):
    """Body of ``GET /health``."""

    status: Literal["healthy"] = "healthy"
    service: str
    version: str
    indexed_chunks: int
    embedding_device: str


class SearchMatch(BaseModel):
    """A single matching line together with its surrounding context."""

    file: str = Field(..., description="Path relative to the repository root")
    absolute_path: str
    line_number: int
    line_content: str
    context_before: list[str] = Field(default_factory=list)
    context_after: list[str] = Field(default_factory=list)
    score: float | None = Field(None, description="Similarity score for fuzzy search")


class SearchResponse(BaseModel):
    """Body returned by the regex and fuzzy search endpoints."""

    results: list[SearchMatch]
    total_matches: int
    query: str
    search_type: Literal["regex", "fuzzy"]
    truncated: bool = Field(
        False, description="True when the result limit cut the match list short"
    )
    threshold: int | None = None


class FileEntry(BaseModel):
    """One entry of a directory listing."""

    name: str
    type: Literal["file", "directory"]
    path: str


class FileContentResponse(BaseModel):
    """Body returned by ``POST /api/files/content``."""

    content: str
    path: str
    size_bytes: int
    truncated: bool = False
