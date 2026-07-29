"""Hybrid retrieval: dense vector similarity fused with BM25 keyword scoring.

Why this exists
---------------
Semantic search is good at "how does authentication work?" but poor at exact
identifiers like ``UserRepositoryImpl``. BM25 is the opposite. Fusing both gives
noticeably better context for a code assistant.

The previous implementation keyed its score table on ``id(document)`` — the
CPython object address. Chroma returns freshly constructed ``Document`` objects
for every query, so a chunk retrieved by both strategies got two different keys
and the two score sets were never actually combined. Documents are now keyed by
a stable content fingerprint.
"""

from __future__ import annotations

import hashlib
import re
import threading
from dataclasses import dataclass

from langchain_core.documents import Document
from rank_bm25 import BM25Okapi

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _fingerprint(document: Document) -> str:
    """Return a stable identity for a chunk.

    Source path plus a content hash survives Chroma round-trips, unlike object
    identity, so the same chunk always maps to the same fusion bucket.
    """
    source = str(document.metadata.get("source", ""))
    digest = hashlib.sha1(
        document.page_content.encode("utf-8", errors="ignore"), usedforsecurity=False
    ).hexdigest()
    return f"{source}:{digest}"


# Splitting on whitespace alone is not enough for source code: "authenticate(user,"
# would become a single token that no query ever matches. Word characters are
# extracted instead, then identifiers are additionally broken into their parts.
_WORD = re.compile(r"[A-Za-z0-9_]+")
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def _tokenize(text: str) -> list[str]:
    """Split text into BM25 tokens, indexing identifiers whole and in pieces.

    ``get_user_by_id(self)`` yields ``get_user_by_id`` plus ``get``, ``user``,
    ``by`` and ``id``; ``getUserById`` is split on camel-case boundaries too. A
    query for "user id" therefore matches either spelling.
    """
    tokens: list[str] = []

    for word in _WORD.findall(text):
        lowered = word.lower()
        tokens.append(lowered)

        # snake_case / SCREAMING_CASE, then camelCase within each part.
        parts: list[str] = []
        for chunk in word.split("_"):
            if chunk:
                parts.extend(_CAMEL_BOUNDARY.split(chunk))

        for part in parts:
            part_lower = part.lower()
            if len(part_lower) > 1 and part_lower != lowered:
                tokens.append(part_lower)

    return tokens


@dataclass(slots=True)
class _ScoredDocument:
    document: Document
    semantic: float = 0.0
    bm25: float = 0.0

    def combined(self, semantic_weight: float, bm25_weight: float) -> float:
        return self.semantic * semantic_weight + self.bm25 * bm25_weight


class HybridSearcher:
    """Fuses dense vector similarity with BM25 keyword relevance."""

    def __init__(
        self,
        semantic_weight: float | None = None,
        bm25_weight: float | None = None,
    ) -> None:
        self.semantic_weight = (
            settings.SEMANTIC_WEIGHT if semantic_weight is None else semantic_weight
        )
        self.bm25_weight = settings.BM25_WEIGHT if bm25_weight is None else bm25_weight

        self._lock = threading.Lock()
        self._bm25: BM25Okapi | None = None
        self._documents: list[Document] = []
        # Fingerprint of the indexed corpus; changing it invalidates the index.
        self._corpus_signature: str | None = None

    # --- BM25 index -----------------------------------------------------------

    def invalidate(self) -> None:
        """Drop the cached BM25 index (call after re-ingesting a repository)."""
        with self._lock:
            self._bm25 = None
            self._documents = []
            self._corpus_signature = None

    def _ensure_index(self, documents: list[Document], signature: str) -> None:
        """Build the BM25 index if the corpus changed since the last build."""
        if self._bm25 is not None and self._corpus_signature == signature:
            return
        logger.info("Building BM25 index over %s chunks", len(documents))
        self._documents = documents
        self._bm25 = BM25Okapi([_tokenize(doc.page_content) for doc in documents])
        self._corpus_signature = signature

    # --- Search ---------------------------------------------------------------

    def search(self, query: str, vector_store, k: int | None = None) -> list[Document]:
        """Return the ``k`` most relevant chunks for ``query``.

        Args:
            query: Natural-language or keyword query.
            vector_store: A Chroma store to run the dense search against.
            k: Number of chunks to return; defaults to ``RETRIEVAL_TOP_K``.
        """
        k = k or settings.RETRIEVAL_TOP_K

        corpus = self._load_corpus(vector_store)
        if not corpus:
            logger.warning("Vector store is empty; hybrid search has nothing to rank")
            return []

        with self._lock:
            signature = f"{len(corpus)}:{_fingerprint(corpus[0])}"
            self._ensure_index(corpus, signature)
            bm25 = self._bm25
            documents = self._documents

        scored: dict[str, _ScoredDocument] = {}

        # 1. Dense retrieval. Over-fetch so fusion has candidates to work with.
        for document, distance in vector_store.similarity_search_with_score(
            query, k=k * 3
        ):
            key = _fingerprint(document)
            # Chroma returns a distance; map it into a bounded (0, 1] similarity.
            similarity = 1.0 / (1.0 + max(distance, 0.0))
            entry = scored.setdefault(key, _ScoredDocument(document))
            entry.semantic = max(entry.semantic, similarity)

        # 2. Sparse retrieval over the same corpus.
        if bm25 is not None and documents:
            raw_scores = bm25.get_scores(_tokenize(query))
            best = float(max(raw_scores)) if len(raw_scores) else 0.0
            if best > 0:
                ranked = sorted(
                    range(len(raw_scores)), key=lambda i: raw_scores[i], reverse=True
                )
                for index in ranked[: k * 3]:
                    document = documents[index]
                    key = _fingerprint(document)
                    entry = scored.setdefault(key, _ScoredDocument(document))
                    entry.bm25 = float(raw_scores[index]) / best

        if not scored:
            return []

        ordered = sorted(
            scored.values(),
            key=lambda item: item.combined(self.semantic_weight, self.bm25_weight),
            reverse=True,
        )

        if logger.isEnabledFor(10):  # logging.DEBUG
            for rank, item in enumerate(ordered[:k], 1):
                logger.debug(
                    "%2d. %.3f (semantic=%.3f bm25=%.3f) %s",
                    rank,
                    item.combined(self.semantic_weight, self.bm25_weight),
                    item.semantic,
                    item.bm25,
                    item.document.metadata.get("relative_path", "unknown"),
                )

        return [item.document for item in ordered[:k]]

    @staticmethod
    def _load_corpus(vector_store) -> list[Document]:
        """Materialise every stored chunk so BM25 can index it."""
        try:
            payload = vector_store.get(include=["documents", "metadatas"])
        except Exception:
            logger.exception("Could not read documents from the vector store")
            return []

        texts = payload.get("documents") or []
        metadatas = payload.get("metadatas") or []
        return [
            Document(page_content=text, metadata=metadata or {})
            for text, metadata in zip(texts, metadatas, strict=False)
            if text
        ]


_searcher: HybridSearcher | None = None
_searcher_lock = threading.Lock()


def get_hybrid_searcher() -> HybridSearcher:
    """Return the process-wide hybrid searcher."""
    global _searcher
    with _searcher_lock:
        if _searcher is None:
            _searcher = HybridSearcher()
        return _searcher


def hybrid_search(query: str, vector_store, k: int | None = None) -> list[Document]:
    """Convenience wrapper around the shared :class:`HybridSearcher`."""
    return get_hybrid_searcher().search(query, vector_store, k=k)
