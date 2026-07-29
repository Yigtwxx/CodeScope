"""File browsing endpoints backing the frontend explorer and code viewer."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.schemas import FileContentResponse, FileEntry, PathRequest
from app.core.config import settings
from app.core.logging import get_logger
from app.core.paths import PathValidationError, resolve_user_path

logger = get_logger(__name__)

router = APIRouter()

# Directories that only add noise to a repository listing.
HIDDEN_DIRECTORIES = {
    "node_modules",
    "__pycache__",
    ".git",
    ".next",
    ".venv",
    "venv",
    "dist",
    "build",
}


@router.post("/list", response_model=list[FileEntry])
async def list_files(request: PathRequest) -> list[FileEntry]:
    """List the direct children of a directory, folders first."""
    try:
        target = resolve_user_path(request.path)
    except PathValidationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    if not target.is_dir():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Path is not a directory")

    entries: list[FileEntry] = []
    try:
        for entry in target.iterdir():
            if entry.name.startswith(".") or entry.name in HIDDEN_DIRECTORIES:
                continue
            try:
                is_dir = entry.is_dir()
            except OSError:
                # Broken symlink or a path we lack permission to stat.
                continue
            entries.append(
                FileEntry(
                    name=entry.name,
                    type="directory" if is_dir else "file",
                    path=str(entry),
                )
            )
    except PermissionError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Permission denied for this directory"
        ) from exc
    except OSError as exc:
        logger.exception("Failed to list %s", target)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not read directory"
        ) from exc

    entries.sort(key=lambda item: (item.type != "directory", item.name.lower()))
    return entries


@router.post("/content", response_model=FileContentResponse)
async def get_file_content(request: PathRequest) -> FileContentResponse:
    """Return the decoded text content of a single file."""
    try:
        target = resolve_user_path(request.path)
    except PathValidationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    if not target.is_file():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Path is not a file")

    try:
        size = target.stat().st_size
    except OSError as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not stat file"
        ) from exc

    limit = settings.MAX_FILE_SIZE_BYTES
    truncated = size > limit

    try:
        with target.open("r", encoding="utf-8", errors="replace") as handle:
            content = handle.read(limit)
    except PermissionError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Permission denied for this file"
        ) from exc
    except OSError as exc:
        logger.exception("Failed to read %s", target)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not read file"
        ) from exc

    if truncated:
        content += (
            f"\n\n--- File truncated at {limit // 1024} KB "
            f"(actual size: {size // 1024} KB) ---\n"
        )

    return FileContentResponse(
        content=content,
        path=str(target),
        size_bytes=size,
        truncated=truncated,
    )
