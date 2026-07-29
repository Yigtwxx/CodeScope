"""ChromaDB vector store access.

Both the embedding model and the vector store are cached process-wide. The
previous implementation rebuilt ``HuggingFaceEmbeddings`` on every call, which
reloaded a sentence-transformers model from disk on every chat message, search
and ingestion batch.
"""

from __future__ import annotations

import shutil
from functools import lru_cache

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from app.core.config import settings
from app.core.device import resolve_device
from app.core.logging import get_logger

logger = get_logger(__name__)

# Records which model produced the vectors on disk. Vectors from two different
# models are not comparable, and usually not even the same width.
MODEL_STAMP_FILENAME = ".embedding-model"


@lru_cache(maxsize=1)
def get_embeddings() -> HuggingFaceEmbeddings:
    """Return the shared embedding model, loading it on first use."""
    device = resolve_device()
    logger.info(
        "Loading embedding model %s on %s", settings.EMBEDDING_MODEL_NAME, device
    )
    # Instruction-tuned embedding models expect a task prefix, and expect a
    # different one for queries than for documents. Models that need no prefix
    # leave both blank, in which case nothing is passed through.
    encode_kwargs: dict[str, object] = {"normalize_embeddings": True}
    query_encode_kwargs = dict(encode_kwargs)
    if settings.EMBEDDING_DOCUMENT_PROMPT:
        encode_kwargs["prompt"] = settings.EMBEDDING_DOCUMENT_PROMPT
    if settings.EMBEDDING_QUERY_PROMPT:
        query_encode_kwargs["prompt"] = settings.EMBEDDING_QUERY_PROMPT

    return HuggingFaceEmbeddings(
        model_name=settings.EMBEDDING_MODEL_NAME,
        model_kwargs={
            "device": device,
            "trust_remote_code": settings.EMBEDDING_TRUST_REMOTE_CODE,
        },
        # Cosine similarity behaves better on normalised vectors.
        encode_kwargs=encode_kwargs,
        query_encode_kwargs=query_encode_kwargs,
    )


def _discard_index_from_another_model() -> None:
    """Drop a persisted index that a different embedding model wrote.

    Chroma stores raw vectors, so switching models leaves the collection
    holding embeddings of the wrong width and meaning. Its own error for that
    is a dimensionality complaint several layers deep, which tells the user
    nothing useful. The index is a derived cache, so it is rebuilt instead.
    """
    stamp = settings.CHROMA_DB_DIR / MODEL_STAMP_FILENAME
    current = settings.EMBEDDING_MODEL_NAME

    previous = None
    if stamp.exists():
        try:
            previous = stamp.read_text(encoding="utf-8").strip()
        except OSError:
            logger.warning("Could not read %s; treating the index as stale", stamp)

    if previous == current:
        return

    has_index = any(
        path.name != MODEL_STAMP_FILENAME for path in settings.CHROMA_DB_DIR.iterdir()
    )
    if previous is not None or has_index:
        logger.warning(
            "Embedding model changed (%s -> %s); discarding the existing index. "
            "Re-index the repository from settings.",
            previous or "unknown",
            current,
        )
        for path in settings.CHROMA_DB_DIR.iterdir():
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            else:
                path.unlink(missing_ok=True)

    try:
        stamp.write_text(current, encoding="utf-8")
    except OSError:
        logger.warning("Could not record the embedding model at %s", stamp)


@lru_cache(maxsize=1)
def get_vector_store() -> Chroma:
    """Return the shared, disk-persisted Chroma vector store."""
    settings.CHROMA_DB_DIR.mkdir(parents=True, exist_ok=True)
    _discard_index_from_another_model()
    logger.info("Opening Chroma collection at %s", settings.CHROMA_DB_DIR)
    return Chroma(
        persist_directory=str(settings.CHROMA_DB_DIR),
        embedding_function=get_embeddings(),
        collection_name=settings.CHROMA_COLLECTION_NAME,
    )


def count_documents() -> int:
    """Return the number of chunks currently indexed."""
    try:
        return get_vector_store()._collection.count()
    except Exception:  # pragma: no cover - depends on chroma internals
        logger.exception("Could not count documents in the vector store")
        return 0


def reset_vector_store() -> None:
    """Drop every chunk from the collection, keeping the store usable."""
    store = get_vector_store()
    try:
        store.reset_collection()
        logger.info("Vector store collection reset")
    except Exception:
        logger.exception("Failed to reset the collection")
        raise


def delete_persisted_data() -> None:
    """Remove the on-disk Chroma directory and drop cached handles."""
    get_vector_store.cache_clear()
    if settings.CHROMA_DB_DIR.exists():
        shutil.rmtree(settings.CHROMA_DB_DIR, ignore_errors=True)
        logger.info("Removed persisted vector store at %s", settings.CHROMA_DB_DIR)
