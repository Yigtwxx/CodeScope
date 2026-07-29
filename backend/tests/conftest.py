"""Shared pytest fixtures.

Tests never touch the real vector store or a real LLM. Anything that would load
a sentence-transformers model or call Ollama is stubbed out.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from langchain_core.documents import Document

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class FakeStore:
    """Stands in for the Chroma collection; records what it was asked to store."""

    def __init__(self, *, fail: bool = False) -> None:
        self.stored: list[Document] = []
        self.fail = fail

    def add_documents(self, documents: list[Document]) -> None:
        if self.fail:
            raise RuntimeError("disk is full")
        self.stored.extend(documents)


class _NullSearcher:
    def invalidate(self) -> None:
        return None


@pytest.fixture
def sample_repo(tmp_path: Path) -> Path:
    """Create a small repository tree covering the interesting edge cases."""
    repo = tmp_path / "sample_repo"
    (repo / "src").mkdir(parents=True)
    (repo / "node_modules" / "junk").mkdir(parents=True)
    (repo / ".git").mkdir()

    (repo / "src" / "auth.py").write_text(
        "def authenticate(user: str, password: str) -> bool:\n"
        '    """Check credentials."""\n'
        "    return bool(user and password)\n"
        "\n"
        "\n"
        "class SessionManager:\n"
        "    def create(self) -> str:\n"
        '        return "token"\n',
        encoding="utf-8",
    )
    (repo / "src" / "widget.tsx").write_text(
        "export const Widget = () => {\n"
        "  return <div>hello</div>\n"
        "}\n"
        "\n"
        "export class Store {\n"
        "  value = 1\n"
        "}\n",
        encoding="utf-8",
    )
    (repo / "README.md").write_text(
        "# Sample\n\nAuthentication demo.\n", encoding="utf-8"
    )

    # Should be skipped by both ingestion and search.
    (repo / "node_modules" / "junk" / "index.js").write_text(
        "module.exports = 1\n", encoding="utf-8"
    )
    (repo / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00binary")
    (repo / "package-lock.json").write_text("{}", encoding="utf-8")

    return repo


@pytest.fixture
def workspace_root(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """Point the path sandbox at a temporary directory."""
    from app.core.config import settings

    root = tmp_path.resolve()
    monkeypatch.setattr(settings, "WORKSPACE_ROOT", root)
    return root


@pytest.fixture
def empty_index(
    monkeypatch: pytest.MonkeyPatch, tmp_path_factory: pytest.TempPathFactory
):
    """Make the app behave as though no repository has been indexed.

    Every module that imported ``count_documents`` by name holds its own
    reference, so each binding has to be replaced. Patching only the defining
    module let a developer's real vector store leak into the test run.
    """
    import app.db.chroma as chroma_module
    import app.services.rag as rag_module
    import main
    from app.core.config import settings

    # Deliberately outside the workspace fixture's directory, otherwise the
    # store shows up in directory-listing assertions.
    monkeypatch.setattr(
        settings, "CHROMA_DB_DIR", tmp_path_factory.mktemp("chroma_store")
    )
    for module in (chroma_module, rag_module, main):
        monkeypatch.setattr(module, "count_documents", lambda: 0)


@pytest.fixture
def fake_store(monkeypatch: pytest.MonkeyPatch) -> FakeStore:
    """Point ingestion at an in-memory store instead of ChromaDB."""
    from app.services import ingestion

    store = FakeStore()
    monkeypatch.setattr(ingestion, "get_vector_store", lambda: store)
    monkeypatch.setattr(ingestion, "reset_vector_store", lambda: None)
    monkeypatch.setattr(ingestion, "get_hybrid_searcher", _NullSearcher)
    return store


@pytest.fixture
def failing_store(monkeypatch: pytest.MonkeyPatch) -> FakeStore:
    """A store whose writes fail, to exercise the indexing error path."""
    from app.services import ingestion

    store = FakeStore(fail=True)
    monkeypatch.setattr(ingestion, "get_vector_store", lambda: store)
    monkeypatch.setattr(ingestion, "reset_vector_store", lambda: None)
    monkeypatch.setattr(ingestion, "get_hybrid_searcher", _NullSearcher)
    return store


@pytest.fixture
def client(empty_index, workspace_root: Path):
    """A TestClient backed by an empty index and a sandboxed workspace."""
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as test_client:
        yield test_client
