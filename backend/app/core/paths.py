"""Filesystem path validation.

The API accepts user-supplied paths for browsing, reading and indexing. Without
validation a request such as ``{"path": "../../../../etc/passwd"}`` would happily
be served, so every path is normalised and constrained to ``WORKSPACE_ROOT``.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings


class PathValidationError(ValueError):
    """Raised when a user-supplied path is unusable or outside the sandbox."""


def _strip_quotes(raw: str) -> str:
    """Remove wrapping quotes that shells and file explorers add to paths."""
    return raw.strip().strip("\"'").strip()


def resolve_user_path(raw_path: str, *, must_exist: bool = True) -> Path:
    """Normalise ``raw_path`` and assert it stays inside the workspace root.

    Args:
        raw_path: Path as supplied by the client.
        must_exist: When true, a missing path raises ``PathValidationError``.

    Returns:
        The resolved absolute path.

    Raises:
        PathValidationError: The path is empty, escapes the sandbox, or is
            required to exist but does not.
    """
    cleaned = _strip_quotes(raw_path or "")
    if not cleaned:
        raise PathValidationError("Path must not be empty")

    try:
        # ``strict=False`` resolves symlinks and ".." segments without
        # requiring the target to exist yet.
        resolved = Path(cleaned).expanduser().resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise PathValidationError(f"Path could not be resolved: {exc}") from exc

    root = settings.WORKSPACE_ROOT
    if not _is_relative_to(resolved, root):
        raise PathValidationError(
            f"Path is outside the allowed workspace root ({root}). "
            "Set WORKSPACE_ROOT to widen the sandbox."
        )

    if must_exist and not resolved.exists():
        raise PathValidationError(f"Path not found: {resolved}")

    return resolved


def _is_relative_to(path: Path, root: Path) -> bool:
    """Backport-friendly ``Path.is_relative_to`` that never raises."""
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True
