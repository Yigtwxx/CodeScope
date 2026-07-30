"""Tests for the filesystem sandbox."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.paths import PathValidationError, resolve_user_path


def test_resolves_a_path_inside_the_workspace(workspace_root: Path) -> None:
    target = workspace_root / "project"
    target.mkdir()

    assert resolve_user_path(str(target)) == target


def test_strips_surrounding_quotes(workspace_root: Path) -> None:
    target = workspace_root / "project"
    target.mkdir()

    assert resolve_user_path(f'"{target}"') == target


def test_rejects_traversal_outside_the_workspace(workspace_root: Path) -> None:
    escape = workspace_root / ".." / ".." / "etc"

    with pytest.raises(PathValidationError, match="outside the allowed workspace"):
        resolve_user_path(str(escape))


def test_rejects_an_empty_path(workspace_root: Path) -> None:
    with pytest.raises(PathValidationError, match="must not be empty"):
        resolve_user_path("   ")


def test_reports_missing_paths(workspace_root: Path) -> None:
    with pytest.raises(PathValidationError, match="Path not found"):
        resolve_user_path(str(workspace_root / "does-not-exist"))


def test_allows_missing_paths_when_existence_is_not_required(
    workspace_root: Path,
) -> None:
    candidate = workspace_root / "not-yet"

    assert resolve_user_path(str(candidate), must_exist=False) == candidate
