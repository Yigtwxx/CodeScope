"""Tests for regex and fuzzy repository search."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.code_search import (
    InvalidPatternError,
    compile_pattern,
    fuzzy_search,
    iter_searchable_files,
    regex_search,
)


def test_ignores_vendored_and_binary_files(sample_repo: Path) -> None:
    names = {path.name for path in iter_searchable_files(sample_repo)}

    assert "auth.py" in names
    assert "widget.tsx" in names
    assert "README.md" in names
    # node_modules is pruned and .png is not a searchable extension.
    assert "index.js" not in names
    assert "logo.png" not in names


def test_regex_search_finds_a_definition(sample_repo: Path) -> None:
    results, truncated = regex_search(r"def authenticate", sample_repo)

    assert not truncated
    assert len(results) == 1
    match = results[0]
    assert match.file_path == "src/auth.py"
    assert match.line_number == 1
    assert "authenticate" in match.line_content


def test_regex_results_carry_both_relative_and_absolute_paths(
    sample_repo: Path,
) -> None:
    results, _ = regex_search(r"SessionManager", sample_repo)

    match = results[0]
    # The UI lists the relative path but opens the absolute one.
    assert not Path(match.file_path).is_absolute()
    assert Path(match.absolute_path).is_absolute()
    assert Path(match.absolute_path).exists()


def test_regex_search_includes_surrounding_context(sample_repo: Path) -> None:
    results, _ = regex_search(r"class SessionManager", sample_repo)

    match = results[0]
    assert match.context_before
    assert match.context_after


def test_regex_search_respects_the_result_limit(sample_repo: Path) -> None:
    results, truncated = regex_search(r".", sample_repo, max_results=2)

    assert len(results) == 2
    assert truncated


def test_invalid_regex_is_reported(sample_repo: Path) -> None:
    with pytest.raises(InvalidPatternError, match="Invalid regex"):
        regex_search("class(", sample_repo)


@pytest.mark.parametrize("pattern", ["(a+)+", "(x*)*"])
def test_catastrophic_patterns_are_rejected(pattern: str) -> None:
    with pytest.raises(InvalidPatternError, match="nested quantifier"):
        compile_pattern(pattern)


def test_overlong_patterns_are_rejected() -> None:
    with pytest.raises(InvalidPatternError, match="too long"):
        compile_pattern("a" * 500)


def test_fuzzy_search_tolerates_typos(sample_repo: Path) -> None:
    results, _ = fuzzy_search("authenticat", sample_repo, threshold=80)

    assert any("auth.py" in result.file_path for result in results)


def test_fuzzy_results_are_ranked_by_score(sample_repo: Path) -> None:
    results, _ = fuzzy_search("authenticate", sample_repo, threshold=60)

    scores = [result.score or 0 for result in results]
    assert scores == sorted(scores, reverse=True)


def test_search_on_a_missing_directory_returns_nothing(tmp_path: Path) -> None:
    results, truncated = regex_search("anything", tmp_path / "nope")

    assert results == []
    assert not truncated
