"""Repository ingestion: crawl, chunk, enrich and index a codebase."""

from __future__ import annotations

import os
from collections import defaultdict
from collections.abc import Iterator
from pathlib import Path

from langchain_core.documents import Document
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

from app.core.config import settings
from app.core.logging import get_logger
from app.db.chroma import get_vector_store, reset_vector_store
from app.services.hybrid_search import get_hybrid_searcher

logger = get_logger(__name__)

# Extensions that get indexed for semantic search.
SUPPORTED_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".cpp", ".c", ".h",
    ".hpp", ".cs", ".php", ".rb", ".rs", ".swift", ".kt", ".scala", ".sql",
    ".sh", ".md", ".txt", ".rst", ".yaml", ".yml", ".toml", ".json",
}  # fmt: skip

IGNORED_DIRECTORIES = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", "venv", ".venv", "env", ".idea", ".vscode",
    "dist", "build", "out", "target", "coverage", ".next", ".nuxt", ".turbo",
    "chroma_db",
}  # fmt: skip

# Lock files and generated bundles are large and carry no useful signal.
IGNORED_FILENAMES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "Cargo.lock",
    "composer.lock",
}

EXTENSION_LANGUAGES = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".rs": "rust",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".sql": "sql",
    ".sh": "bash",
    ".md": "markdown",
    ".txt": "text",
    ".rst": "text",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".json": "json",
}

# Splitters that understand language syntax produce far better chunk boundaries.
SPLITTER_LANGUAGES = {
    ".py": Language.PYTHON,
    ".js": Language.JS,
    ".jsx": Language.JS,
    ".ts": Language.TS,
    ".tsx": Language.TS,
    ".java": Language.JAVA,
    ".cpp": Language.CPP,
    ".c": Language.CPP,
    ".hpp": Language.CPP,
    ".h": Language.CPP,
    ".go": Language.GO,
    ".rs": Language.RUST,
    ".cs": Language.CSHARP,
    ".php": Language.PHP,
    ".rb": Language.RUBY,
    ".swift": Language.SWIFT,
    ".kt": Language.KOTLIN,
    ".scala": Language.SCALA,
    ".md": Language.MARKDOWN,
}


def detect_language(extension: str) -> str:
    """Map a file extension to a language label used in metadata and prompts."""
    return EXTENSION_LANGUAGES.get(extension.lower(), "unknown")


def get_splitter(extension: str) -> RecursiveCharacterTextSplitter:
    """Return a syntax-aware splitter for ``extension``, or a generic fallback."""
    language = SPLITTER_LANGUAGES.get(extension.lower())
    if language is not None:
        try:
            return RecursiveCharacterTextSplitter.from_language(
                language=language,
                chunk_size=settings.CHUNK_SIZE,
                chunk_overlap=settings.CHUNK_OVERLAP,
                # Needed to map chunks back to line ranges for code intelligence.
                add_start_index=True,
            )
        except (ValueError, KeyError):
            logger.debug("No syntax splitter for %s; using the generic one", extension)

    return RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        length_function=len,
        add_start_index=True,
    )


def _looks_binary(path: Path) -> bool:
    """Detect binary files cheaply by looking for a NUL byte in the first 8 KB."""
    try:
        with path.open("rb") as handle:
            return b"\x00" in handle.read(8192)
    except OSError:
        return True


def iter_source_files(repo_path: Path) -> Iterator[Path]:
    """Yield every indexable source file below ``repo_path``."""
    for current_dir, dirnames, filenames in os.walk(repo_path, onerror=lambda _: None):
        dirnames[:] = [
            d
            for d in dirnames
            if d not in IGNORED_DIRECTORIES and not d.startswith(".")
        ]
        for filename in filenames:
            if filename in IGNORED_FILENAMES:
                continue
            path = Path(current_dir) / filename
            if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            try:
                if path.stat().st_size > settings.MAX_INGEST_FILE_SIZE_BYTES:
                    logger.debug("Skipping oversized file %s", path)
                    continue
            except OSError:
                continue
            if _looks_binary(path):
                continue
            yield path


def load_documents(repo_path: Path) -> list[Document]:
    """Read every indexable file into a ``Document`` with rich metadata."""
    documents: list[Document] = []

    for path in iter_source_files(repo_path):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            logger.warning("Could not read %s: %s", path, exc)
            continue

        if not text.strip():
            continue

        extension = path.suffix.lower()
        documents.append(
            Document(
                page_content=text,
                metadata={
                    "source": str(path),
                    "filename": path.name,
                    "extension": extension,
                    "language": detect_language(extension),
                    "relative_path": path.relative_to(repo_path).as_posix(),
                },
            )
        )

    return documents


def chunk_documents(documents: list[Document]) -> list[Document]:
    """Split documents into chunks using a splitter chosen per language."""
    by_extension: dict[str, list[Document]] = defaultdict(list)
    for document in documents:
        by_extension[document.metadata.get("extension", ".txt")].append(document)

    chunks: list[Document] = []
    for extension, group in by_extension.items():
        produced = get_splitter(extension).split_documents(group)
        chunks.extend(produced)
        logger.info(
            "%-12s %4d chunks from %3d files",
            detect_language(extension),
            len(produced),
            len(group),
        )

    return chunks


def ingest_repository_stream(repo_path: str | Path) -> Iterator[str]:
    """Ingest a repository, yielding human-readable progress lines.

    The generator is consumed by a streaming HTTP response, so every stage
    reports progress instead of blocking silently for minutes.
    """
    root = Path(repo_path).resolve()

    yield "Starting repository ingestion\n"
    logger.info("Ingesting %s", root)

    if not root.is_dir():
        message = f"ERROR: not a directory: {root}"
        logger.error(message)
        yield message + "\n"
        return

    yield f"Repository: {root}\n"

    # --- 1. Load ---------------------------------------------------------------
    yield "\nStep 1/4  Reading source files...\n"
    documents = load_documents(root)
    if not documents:
        message = "No indexable files found. Supported extensions: " + ", ".join(
            sorted(SUPPORTED_EXTENSIONS)
        )
        logger.warning(message)
        yield message + "\n"
        return
    yield f"  Loaded {len(documents)} files\n"

    # --- 2. Chunk --------------------------------------------------------------
    yield "\nStep 2/4  Splitting into code-aware chunks...\n"
    chunks = chunk_documents(documents)
    if not chunks:
        yield "  No chunks were produced; aborting.\n"
        return
    yield f"  Produced {len(chunks)} chunks\n"

    # --- 3. Enrich -------------------------------------------------------------
    yield "\nStep 3/4  Extracting functions and classes...\n"
    try:
        from app.services.code_intelligence import (
            add_entities_to_metadata,
            extract_code_entities,
        )

        entities = extract_code_entities(documents)
        if entities:
            chunks = add_entities_to_metadata(chunks, entities)
            total = sum(len(items) for items in entities.values())
            yield f"  Indexed {total} entities across {len(entities)} files\n"
        else:
            yield "  No parseable entities found\n"
    except Exception as exc:
        # AST extraction is an enhancement; never fail ingestion because of it.
        logger.exception("Code intelligence extraction failed")
        yield f"  Skipped (non-critical): {exc}\n"

    # --- 4. Index --------------------------------------------------------------
    yield "\nStep 4/4  Writing to the vector store...\n"
    try:
        reset_vector_store()
        get_hybrid_searcher().invalidate()
    except Exception as exc:
        logger.exception("Could not clear the previous index")
        yield f"ERROR: could not clear the previous index: {exc}\n"
        return

    store = get_vector_store()
    batch_size = settings.INGEST_BATCH_SIZE
    total_batches = (len(chunks) + batch_size - 1) // batch_size

    try:
        for batch_number, start in enumerate(range(0, len(chunks), batch_size), 1):
            store.add_documents(chunks[start : start + batch_size])
            yield f"  Batch {batch_number}/{total_batches} stored\n"
    except Exception as exc:
        logger.exception("Failed to write chunks to the vector store")
        yield f"ERROR: indexing failed: {exc}\n"
        return

    logger.info("Ingestion complete: %s files, %s chunks", len(documents), len(chunks))
    yield (
        f"\nINGESTION COMPLETE\n  Files:  {len(documents)}\n  Chunks: {len(chunks)}\n"
    )
