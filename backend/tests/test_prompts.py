"""The RAG prompt is a `str.format`-style template.

Any stray brace in the prose becomes a template variable, which fails at request
time rather than at import — the whole answer is replaced by an error message.
These tests pin the contract.
"""

from __future__ import annotations

from langchain_core.prompts import PromptTemplate

from app.services.prompts import RAG_PROMPT_TEMPLATE

EXPECTED_VARIABLES = {"context", "question"}


def test_template_declares_exactly_the_expected_variables() -> None:
    template = PromptTemplate.from_template(RAG_PROMPT_TEMPLATE)

    assert set(template.input_variables) == EXPECTED_VARIABLES, (
        "A brace in the prompt prose was read as a variable. Escape it as {{ }}."
    )


def test_template_renders_with_only_those_variables() -> None:
    template = PromptTemplate(
        template=RAG_PROMPT_TEMPLATE, input_variables=sorted(EXPECTED_VARIABLES)
    )

    rendered = template.format(context="CONTEXT HERE", question="QUESTION HERE")

    assert "CONTEXT HERE" in rendered
    assert "QUESTION HERE" in rendered


def test_template_keeps_the_grounding_and_language_rules() -> None:
    # These two are what stop the model inventing files and switching language.
    assert "only source of truth" in RAG_PROMPT_TEMPLATE
    assert "same language the question was asked in" in RAG_PROMPT_TEMPLATE
