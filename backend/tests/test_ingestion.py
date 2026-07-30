"""Tests for repository crawling and chunking."""

from __future__ import annotations

from pathlib import Path

from conftest import FakeStore  # pytest puts the tests directory on sys.path

from app.services.ingestion import (
    chunk_documents,
    detect_language,
    get_splitter,
    ingest_repository_stream,
    iter_source_files,
    load_documents,
)


def test_crawler_skips_vendored_hidden_and_binary_files(sample_repo: Path) -> None:
    names = {path.name for path in iter_source_files(sample_repo)}

    assert names == {"auth.py", "widget.tsx", "README.md"}


def test_lock_files_are_excluded(sample_repo: Path) -> None:
    assert "package-lock.json" not in {p.name for p in iter_source_files(sample_repo)}


def test_documents_carry_navigation_metadata(sample_repo: Path) -> None:
    documents = load_documents(sample_repo)

    auth = next(d for d in documents if d.metadata["filename"] == "auth.py")
    assert auth.metadata["language"] == "python"
    assert auth.metadata["extension"] == ".py"
    assert auth.metadata["relative_path"] == "src/auth.py"
    assert Path(auth.metadata["source"]).is_absolute()


def test_relative_paths_use_forward_slashes(sample_repo: Path) -> None:
    documents = load_documents(sample_repo)

    for document in documents:
        assert "\\" not in document.metadata["relative_path"]


def test_chunks_record_their_start_index(sample_repo: Path) -> None:
    chunks = chunk_documents(load_documents(sample_repo))

    assert chunks
    assert all("start_index" in chunk.metadata for chunk in chunks)


def test_chunks_inherit_source_metadata(sample_repo: Path) -> None:
    chunks = chunk_documents(load_documents(sample_repo))

    for chunk in chunks:
        assert chunk.metadata["source"]
        assert chunk.metadata["language"]


def test_detect_language_maps_known_extensions() -> None:
    assert detect_language(".py") == "python"
    assert detect_language(".TSX") == "typescript"
    assert detect_language(".unknown") == "unknown"


def test_splitter_falls_back_for_unknown_languages() -> None:
    # Should not raise, and should still produce a usable splitter.
    assert get_splitter(".txt").split_text("a b c" * 500)


def test_empty_directory_yields_no_documents(tmp_path: Path) -> None:
    (tmp_path / "empty").mkdir()

    assert load_documents(tmp_path / "empty") == []


# --- The streaming pipeline ---------------------------------------------------


def test_ingestion_reports_completion_and_stores_every_chunk(
    sample_repo: Path, fake_store: FakeStore
) -> None:
    output = "".join(ingest_repository_stream(sample_repo))

    assert "INGESTION COMPLETE" in output
    assert fake_store.stored, "Expected chunks to reach the vector store"
    assert f"Files:  {len(load_documents(sample_repo))}" in output


def test_ingestion_walks_every_stage_in_order(
    sample_repo: Path, fake_store: FakeStore
) -> None:
    output = "".join(ingest_repository_stream(sample_repo))

    positions = [
        output.index("Step 1/4"),
        output.index("Step 2/4"),
        output.index("Step 3/4"),
        output.index("Step 4/4"),
    ]
    assert positions == sorted(positions)


def test_ingestion_attaches_declarations(
    sample_repo: Path, fake_store: FakeStore
) -> None:
    output = "".join(ingest_repository_stream(sample_repo))

    # sample_repo holds Python and TSX sources, both of which tree-sitter parses.
    assert "Indexed" in output and "entities" in output


def test_ingesting_a_missing_directory_reports_an_error(tmp_path: Path) -> None:
    output = "".join(ingest_repository_stream(tmp_path / "nope"))

    assert "ERROR: not a directory" in output
    assert "INGESTION COMPLETE" not in output


def test_a_repository_with_nothing_indexable_says_so(
    tmp_path: Path, fake_store: FakeStore
) -> None:
    barren = tmp_path / "barren"
    barren.mkdir()
    (barren / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    output = "".join(ingest_repository_stream(barren))

    assert "No indexable files found" in output
    assert not fake_store.stored


def test_a_write_failure_is_reported_instead_of_claiming_success(
    sample_repo: Path, failing_store: FakeStore
) -> None:
    output = "".join(ingest_repository_stream(sample_repo))

    assert "ERROR: indexing failed" in output
    assert "disk is full" in output
    assert "INGESTION COMPLETE" not in output
