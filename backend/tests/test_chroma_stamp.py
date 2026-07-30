"""The persisted index must not survive an embedding-model change.

Chroma stores raw vectors, so an index written by one model is unusable by
another. These tests cover the stamp file that detects the switch.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.db import chroma
from app.db.chroma import MODEL_STAMP_FILENAME, _discard_index_from_another_model


@pytest.fixture
def index_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """An empty on-disk index directory the guard is pointed at."""
    from app.core.config import settings

    directory = tmp_path / "chroma"
    directory.mkdir()
    monkeypatch.setattr(settings, "CHROMA_DB_DIR", directory)
    return directory


def write_index(directory: Path) -> None:
    """Stand in for whatever Chroma leaves on disk."""
    (directory / "chroma.sqlite3").write_text("vectors", encoding="utf-8")
    (directory / "collection-uuid").mkdir()
    (directory / "collection-uuid" / "data_level0.bin").write_bytes(b"\x00\x01")


def test_first_run_records_the_model(index_dir: Path) -> None:
    _discard_index_from_another_model()

    stamp = index_dir / MODEL_STAMP_FILENAME
    assert stamp.exists()
    assert stamp.read_text(encoding="utf-8") == chroma.settings.EMBEDDING_MODEL_NAME


def test_an_index_written_by_the_same_model_is_kept(index_dir: Path) -> None:
    write_index(index_dir)
    (index_dir / MODEL_STAMP_FILENAME).write_text(
        chroma.settings.EMBEDDING_MODEL_NAME, encoding="utf-8"
    )

    _discard_index_from_another_model()

    assert (index_dir / "chroma.sqlite3").exists()


def test_an_index_from_another_model_is_discarded(index_dir: Path) -> None:
    write_index(index_dir)
    (index_dir / MODEL_STAMP_FILENAME).write_text("some/other-model", encoding="utf-8")

    _discard_index_from_another_model()

    assert not (index_dir / "chroma.sqlite3").exists()
    assert not (index_dir / "collection-uuid").exists()
    # The new model is recorded so the next start is a no-op.
    assert (index_dir / MODEL_STAMP_FILENAME).read_text(
        encoding="utf-8"
    ) == chroma.settings.EMBEDDING_MODEL_NAME


def test_an_unstamped_index_is_treated_as_stale(index_dir: Path) -> None:
    # Written by a version of CodeScope that predates the stamp.
    write_index(index_dir)

    _discard_index_from_another_model()

    assert not (index_dir / "chroma.sqlite3").exists()


def test_an_empty_directory_is_left_alone(index_dir: Path) -> None:
    _discard_index_from_another_model()

    assert list(index_dir.iterdir()) == [index_dir / MODEL_STAMP_FILENAME]
