"""Plain-text repository search (regular expressions and fuzzy matching).

Both search modes stream through the repository once, skipping binary blobs,
vendored directories and oversized files, and return matches with a couple of
lines of surrounding context.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

from rapidfuzz import fuzz

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# File types worth searching. Anything else is treated as binary or noise.
SEARCHABLE_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".cpp", ".c", ".h", ".hpp",
    ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".m", ".mm", ".scala",
    ".html", ".css", ".scss", ".sass", ".less", ".vue", ".svelte",
    ".json", ".yaml", ".yml", ".xml", ".toml", ".ini", ".cfg", ".env.example",
    ".md", ".txt", ".rst", ".adoc", ".tex",
    ".sql", ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
}  # fmt: skip

# Directories that are never worth walking into.
IGNORED_DIRECTORIES = {
    "node_modules", ".git", ".hg", ".svn", ".venv", "venv", "env",
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    ".next", ".nuxt", ".turbo", "dist", "build", "out", "target",
    ".cache", "coverage", "vendor", "tmp", "temp", "chroma_db",
}  # fmt: skip

# Regex features that make catastrophic backtracking likely on large files.
_NESTED_QUANTIFIER = re.compile(r"\([^)]*[+*]\)[+*{]")
MAX_PATTERN_LENGTH = 200
CONTEXT_LINES = 2


@dataclass(slots=True)
class SearchResult:
    """A single matching line together with its location and context."""

    file_path: str
    absolute_path: str
    line_number: int
    line_content: str
    context_before: list[str] = field(default_factory=list)
    context_after: list[str] = field(default_factory=list)
    score: float | None = None

    def to_dict(self) -> dict[str, object]:
        """Serialise into the shape the API returns."""
        return {
            "file": self.file_path,
            "absolute_path": self.absolute_path,
            "line_number": self.line_number,
            "line_content": self.line_content,
            "context_before": self.context_before,
            "context_after": self.context_after,
            "score": self.score,
        }


class InvalidPatternError(ValueError):
    """Raised for regex patterns that are malformed or unsafe to run."""


def compile_pattern(pattern: str) -> re.Pattern[str]:
    """Compile a user-supplied regex, rejecting unsafe constructs.

    Raises:
        InvalidPatternError: The pattern is malformed, too long, or contains a
            nested quantifier that can trigger catastrophic backtracking.
    """
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise InvalidPatternError(
            f"Pattern is too long (max {MAX_PATTERN_LENGTH} characters)"
        )

    if _NESTED_QUANTIFIER.search(pattern):
        raise InvalidPatternError(
            "Pattern contains a nested quantifier such as (a+)+, which can hang "
            "the search. Please simplify it."
        )

    try:
        return re.compile(pattern, re.IGNORECASE)
    except re.error as exc:
        raise InvalidPatternError(f"Invalid regex pattern: {exc}") from exc


def _is_searchable(path: Path) -> bool:
    """Return whether a file should be scanned."""
    if path.suffix.lower() not in SEARCHABLE_EXTENSIONS:
        return False
    try:
        return path.stat().st_size <= settings.SEARCH_MAX_FILE_SIZE_BYTES
    except OSError:
        return False


def iter_searchable_files(root: Path) -> Iterator[Path]:
    """Yield every searchable file under ``root``, pruning ignored directories.

    ``Path.rglob`` cannot prune, so it would descend into ``node_modules`` and
    stat tens of thousands of files before discarding them. ``os.walk`` lets us
    cut those subtrees off entirely.
    """
    import os

    scanned = 0
    for current_dir, dirnames, filenames in os.walk(root, onerror=lambda _: None):
        dirnames[:] = [
            d
            for d in dirnames
            if d not in IGNORED_DIRECTORIES and not d.startswith(".")
        ]
        for filename in filenames:
            if scanned >= settings.SEARCH_MAX_FILES:
                logger.warning(
                    "Stopped walking after %s files", settings.SEARCH_MAX_FILES
                )
                return
            candidate = Path(current_dir) / filename
            if _is_searchable(candidate):
                scanned += 1
                yield candidate


def _read_lines(path: Path) -> list[str] | None:
    """Read a file as text lines, returning ``None`` when it is unreadable."""
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            return handle.read().splitlines()
    except (OSError, UnicodeError):
        return None


def _context(lines: list[str], index: int) -> tuple[list[str], list[str]]:
    """Return the lines immediately before and after ``index``."""
    before = lines[max(0, index - CONTEXT_LINES) : index]
    after = lines[index + 1 : index + 1 + CONTEXT_LINES]
    return before, after


def _build_result(
    path: Path,
    root: Path,
    lines: list[str],
    index: int,
    score: float | None = None,
) -> SearchResult:
    before, after = _context(lines, index)
    return SearchResult(
        file_path=path.relative_to(root).as_posix(),
        # The frontend needs the absolute path to open the file in the viewer.
        absolute_path=str(path),
        line_number=index + 1,
        line_content=lines[index],
        context_before=before,
        context_after=after,
        score=score,
    )


def regex_search(
    pattern: str, repo_path: str | Path, max_results: int | None = None
) -> tuple[list[SearchResult], bool]:
    """Search a repository with a regular expression.

    Returns:
        The matches found and a flag indicating whether the limit truncated them.
    """
    limit = max_results or settings.SEARCH_MAX_RESULTS
    root = Path(repo_path).resolve()
    if not root.is_dir():
        logger.warning("Regex search target is not a directory: %s", root)
        return [], False

    regex = compile_pattern(pattern)
    logger.info("Regex search %r in %s", pattern, root)

    results: list[SearchResult] = []
    for file_path in iter_searchable_files(root):
        lines = _read_lines(file_path)
        if lines is None:
            continue
        for index, line in enumerate(lines):
            if regex.search(line):
                results.append(_build_result(file_path, root, lines, index))
                if len(results) >= limit:
                    return results, True

    logger.info("Regex search finished with %s matches", len(results))
    return results, False


def fuzzy_search(
    query: str,
    repo_path: str | Path,
    threshold: int = 70,
    max_results: int | None = None,
) -> tuple[list[SearchResult], bool]:
    """Search a repository with typo-tolerant fuzzy matching.

    Returns:
        Matches sorted by descending similarity, and a truncation flag.
    """
    limit = max_results or settings.SEARCH_MAX_RESULTS
    root = Path(repo_path).resolve()
    if not root.is_dir():
        logger.warning("Fuzzy search target is not a directory: %s", root)
        return [], False

    logger.info("Fuzzy search %r in %s (threshold=%s)", query, root, threshold)
    needle = query.lower()
    # Collect more than we need so the ranking has something to choose from.
    scan_budget = limit * 5
    scored: list[SearchResult] = []
    truncated = False

    for file_path in iter_searchable_files(root):
        if len(scored) >= scan_budget:
            truncated = True
            break
        lines = _read_lines(file_path)
        if lines is None:
            continue
        for index, line in enumerate(lines):
            if not line.strip():
                continue
            score = fuzz.partial_ratio(needle, line.lower())
            if score >= threshold:
                scored.append(_build_result(file_path, root, lines, index, score))
                if len(scored) >= scan_budget:
                    truncated = True
                    break

    scored.sort(key=lambda result: result.score or 0, reverse=True)
    if len(scored) > limit:
        truncated = True
    logger.info("Fuzzy search finished with %s matches", len(scored))
    return scored[:limit], truncated
