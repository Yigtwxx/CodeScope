"""End-to-end HTTP tests for the API surface.

These exercise routing, validation and error mapping. The vector store and LLM
are stubbed so no model is ever loaded.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def test_health_reports_service_metadata(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["service"] == "CodeScope"
    assert body["embedding_device"] in {"cuda", "mps", "cpu"}


# --- File browsing ------------------------------------------------------------


def test_listing_a_directory_puts_folders_first(
    client: TestClient, workspace_root: Path
) -> None:
    (workspace_root / "zeta.txt").write_text("x", encoding="utf-8")
    (workspace_root / "alpha").mkdir()

    response = client.post("/api/files/list", json={"path": str(workspace_root)})

    assert response.status_code == 200
    entries = response.json()
    assert [entry["name"] for entry in entries] == ["alpha", "zeta.txt"]
    assert entries[0]["type"] == "directory"


def test_listing_hides_dotfiles_and_vendored_directories(
    client: TestClient, workspace_root: Path
) -> None:
    (workspace_root / ".secret").write_text("x", encoding="utf-8")
    (workspace_root / "node_modules").mkdir()
    (workspace_root / "visible.py").write_text("x", encoding="utf-8")

    entries = client.post("/api/files/list", json={"path": str(workspace_root)}).json()

    assert [entry["name"] for entry in entries] == ["visible.py"]


def test_listing_a_missing_path_is_a_client_error(
    client: TestClient, workspace_root: Path
) -> None:
    response = client.post(
        "/api/files/list", json={"path": str(workspace_root / "nope")}
    )

    # Regression: this used to be swallowed into a 500.
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_listing_a_file_is_rejected(client: TestClient, workspace_root: Path) -> None:
    target = workspace_root / "file.txt"
    target.write_text("x", encoding="utf-8")

    response = client.post("/api/files/list", json={"path": str(target)})

    assert response.status_code == 400
    assert "not a directory" in response.json()["detail"]


def test_reading_a_file_returns_its_content(
    client: TestClient, workspace_root: Path
) -> None:
    target = workspace_root / "hello.py"
    target.write_text("print('hi')\n", encoding="utf-8")

    response = client.post("/api/files/content", json={"path": str(target)})

    assert response.status_code == 200
    body = response.json()
    assert body["content"] == "print('hi')\n"
    assert body["truncated"] is False


def test_oversized_files_are_truncated_not_rejected(
    client: TestClient, workspace_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "MAX_FILE_SIZE_BYTES", 32)
    target = workspace_root / "big.txt"
    target.write_text("y" * 500, encoding="utf-8")

    body = client.post("/api/files/content", json={"path": str(target)}).json()

    assert body["truncated"] is True
    assert "File truncated" in body["content"]


def test_paths_outside_the_workspace_are_refused(client: TestClient) -> None:
    response = client.post(
        "/api/files/content", json={"path": "../../../../etc/passwd"}
    )

    assert response.status_code == 400
    assert "workspace" in response.json()["detail"]


def test_empty_path_fails_validation(client: TestClient) -> None:
    assert client.post("/api/files/list", json={"path": ""}).status_code == 422


# --- Search -------------------------------------------------------------------


def test_regex_search_returns_matches(client: TestClient, workspace_root: Path) -> None:
    (workspace_root / "app.py").write_text(
        "class UserService:\n    pass\n", encoding="utf-8"
    )

    response = client.post(
        "/api/search/regex",
        json={"query": "class \\w+Service", "repo_path": str(workspace_root)},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["search_type"] == "regex"
    assert body["total_matches"] == 1
    assert body["results"][0]["file"] == "app.py"
    assert body["results"][0]["absolute_path"]


def test_invalid_regex_returns_400(client: TestClient, workspace_root: Path) -> None:
    response = client.post(
        "/api/search/regex",
        json={"query": "class(", "repo_path": str(workspace_root)},
    )

    assert response.status_code == 400


def test_search_rejects_a_missing_repository(client: TestClient) -> None:
    response = client.post(
        "/api/search/regex", json={"query": "x", "repo_path": "/definitely/not/here"}
    )

    assert response.status_code in {400, 404}


def test_fuzzy_search_validates_the_threshold(
    client: TestClient, workspace_root: Path
) -> None:
    response = client.post(
        "/api/search/fuzzy",
        json={"query": "x", "repo_path": str(workspace_root), "threshold": 900},
    )

    assert response.status_code == 422


def test_blank_query_fails_validation(client: TestClient, workspace_root: Path) -> None:
    response = client.post(
        "/api/search/fuzzy", json={"query": "", "repo_path": str(workspace_root)}
    )

    assert response.status_code == 422


# --- Chat ---------------------------------------------------------------------


def test_chat_without_an_index_explains_what_to_do(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "How does auth work?"})

    assert response.status_code == 200
    assert "No repository indexed" in response.text


def test_chat_rejects_an_empty_message(client: TestClient) -> None:
    assert client.post("/api/chat", json={"message": ""}).status_code == 422


# --- Ingestion ----------------------------------------------------------------


def test_ingesting_a_missing_repository_is_rejected(client: TestClient) -> None:
    response = client.post("/api/ingest", json={"repo_path": "/nope/nothing"})

    assert response.status_code in {400, 404}
