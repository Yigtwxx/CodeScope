"""Tests for hybrid (dense + BM25) retrieval.

The regression these guard against: scores used to be keyed on ``id(document)``,
so a chunk returned by both the vector search and BM25 landed in two separate
buckets and the two signals were never actually fused.
"""

from __future__ import annotations

from langchain_core.documents import Document

from app.services.hybrid_search import HybridSearcher, _fingerprint, _tokenize

CHUNKS = [
    Document(
        page_content="def authenticate(user, password):\n    return check_password()",
        metadata={"source": "/repo/auth.py", "relative_path": "auth.py"},
    ),
    Document(
        page_content="class InvoiceRenderer:\n    def render(self):\n        pass",
        metadata={"source": "/repo/invoice.py", "relative_path": "invoice.py"},
    ),
    Document(
        page_content="# Deployment notes\nRun terraform apply to ship.",
        metadata={"source": "/repo/DEPLOY.md", "relative_path": "DEPLOY.md"},
    ),
]


class FakeVectorStore:
    """Minimal stand-in that mimics how Chroma returns fresh Document objects."""

    def __init__(self, chunks: list[Document], ranking: list[int]) -> None:
        self._chunks = chunks
        self._ranking = ranking

    def get(self, include=None):  # noqa: ANN001 - mirrors the Chroma signature
        return {
            "documents": [chunk.page_content for chunk in self._chunks],
            "metadatas": [dict(chunk.metadata) for chunk in self._chunks],
        }

    def similarity_search_with_score(self, query: str, k: int = 8):
        results = []
        for distance, index in enumerate(self._ranking[:k]):
            source = self._chunks[index]
            # Deliberately return a *new* object, like Chroma does.
            copy = Document(
                page_content=source.page_content, metadata=dict(source.metadata)
            )
            results.append((copy, float(distance)))
        return results


def test_fingerprint_is_stable_across_object_identity() -> None:
    original = CHUNKS[0]
    reconstructed = Document(
        page_content=original.page_content, metadata=dict(original.metadata)
    )

    assert original is not reconstructed
    assert _fingerprint(original) == _fingerprint(reconstructed)


def test_tokenizer_splits_snake_case_identifiers() -> None:
    tokens = _tokenize("def get_user_by_id(self):")

    assert "get_user_by_id" in tokens
    assert "user" in tokens
    assert "id" in tokens


def test_semantic_and_keyword_scores_are_fused_not_duplicated() -> None:
    searcher = HybridSearcher(semantic_weight=0.5, bm25_weight=0.5)
    store = FakeVectorStore(CHUNKS, ranking=[0, 1, 2])

    results = searcher.search("authenticate password", store, k=3)

    # Every stored chunk appears exactly once: no duplicate buckets.
    assert len(results) == 3
    assert len({_fingerprint(doc) for doc in results}) == 3


def test_keyword_signal_can_outrank_a_weaker_vector_hit() -> None:
    searcher = HybridSearcher(semantic_weight=0.3, bm25_weight=0.7)
    # The vector search puts the deployment note first; BM25 should pull the
    # chunk that literally contains "authenticate" to the top.
    store = FakeVectorStore(CHUNKS, ranking=[2, 1, 0])

    results = searcher.search("authenticate", store, k=3)

    assert results[0].metadata["relative_path"] == "auth.py"


def test_empty_store_returns_no_results() -> None:
    searcher = HybridSearcher()
    store = FakeVectorStore([], ranking=[])

    assert searcher.search("anything", store, k=5) == []


def test_index_is_rebuilt_after_invalidation() -> None:
    searcher = HybridSearcher()
    store = FakeVectorStore(CHUNKS, ranking=[0, 1, 2])
    searcher.search("authenticate", store, k=1)

    searcher.invalidate()

    assert searcher._bm25 is None
    # Searching again transparently rebuilds it.
    assert searcher.search("authenticate", store, k=1)
    assert searcher._bm25 is not None


def test_k_bounds_the_result_count() -> None:
    searcher = HybridSearcher()
    store = FakeVectorStore(CHUNKS, ranking=[0, 1, 2])

    assert len(searcher.search("render invoice", store, k=2)) == 2
