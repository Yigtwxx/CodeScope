"""Tests for tree-sitter based declaration extraction."""

from __future__ import annotations

import json

import pytest
from langchain_core.documents import Document

from app.services.code_intelligence import (
    add_entities_to_metadata,
    extract_code_entities,
    get_ast_parser,
)

PYTHON_SOURCE = '''
class Repository:
    """Docstring."""

    def find(self, key: str) -> str:
        return key


def standalone(value: int) -> int:
    return value
'''

TS_SOURCE = """
export interface User {
  id: string
}

export const handler = async () => {
  return 1
}

export class Service {
  run() {
    return 2
  }
}

function helper() {
  return 3
}
"""

GO_SOURCE = """
package store

type Repository struct {
	dsn string
}

type Finder interface {
	Find(key string) string
}

func NewRepository(dsn string) *Repository {
	return &Repository{dsn}
}

func (r *Repository) Find(key string) string {
	return key
}
"""

RUST_SOURCE = """
pub struct Repository {
    dsn: String,
}

pub enum Mode {
    Fast,
    Slow,
}

pub trait Finder {
    fn find(&self, key: &str) -> String;
}

impl Repository {
    pub fn new(dsn: String) -> Self {
        Repository { dsn }
    }
}
"""

JAVA_SOURCE = """
package store;

public interface Finder {
    String find(String key);
}

public class Repository implements Finder {
    public Repository() {}

    public String find(String key) {
        return key;
    }
}
"""

CSHARP_SOURCE = """
namespace Store;

public interface IFinder
{
    string Find(string key);
}

public record Pair(int A, int B);

public class Repository : IFinder
{
    public string Dsn { get; set; }

    public string Find(string key) => key;
}
"""


def test_extracts_python_functions_and_classes() -> None:
    entities = get_ast_parser().parse(PYTHON_SOURCE, ".py")

    names = {entity.name: entity.entity_type for entity in entities}
    assert names["Repository"] == "class"
    assert names["find"] == "function"
    assert names["standalone"] == "function"


def test_python_entities_carry_line_numbers() -> None:
    entities = get_ast_parser().parse(PYTHON_SOURCE, ".py")

    repository = next(e for e in entities if e.name == "Repository")
    assert repository.start_line == 2
    assert repository.end_line > repository.start_line


def test_extracts_typescript_declarations() -> None:
    entities = get_ast_parser().parse(TS_SOURCE, ".ts")

    names = {entity.name: entity.entity_type for entity in entities}
    assert names["User"] == "interface"
    assert names["Service"] == "class"
    assert names["helper"] == "function"
    # Arrow functions bound to a const are declarations too.
    assert names["handler"] == "function"


@pytest.mark.parametrize(
    ("source", "extension", "expected"),
    [
        pytest.param(
            GO_SOURCE,
            ".go",
            {
                "Repository": "struct",
                "Finder": "interface",
                "NewRepository": "function",
                "Find": "method",
            },
            id="go",
        ),
        pytest.param(
            RUST_SOURCE,
            ".rs",
            {
                "Repository": "struct",
                "Mode": "enum",
                "Finder": "trait",
                "new": "function",
                "find": "function",
            },
            id="rust",
        ),
        pytest.param(
            JAVA_SOURCE,
            ".java",
            {"Finder": "interface", "Repository": "class", "find": "method"},
            id="java",
        ),
        pytest.param(
            CSHARP_SOURCE,
            ".cs",
            {
                "IFinder": "interface",
                "Pair": "record",
                "Repository": "class",
                "Dsn": "property",
                "Find": "method",
            },
            id="csharp",
        ),
    ],
)
def test_extracts_declarations_from_compiled_languages(
    source: str, extension: str, expected: dict[str, str]
) -> None:
    entities = get_ast_parser().parse(source, extension)

    # Compared as pairs because one name can carry two kinds: a Java or C#
    # constructor shares its class's name.
    found = {(entity.name, entity.entity_type) for entity in entities}
    for name, entity_type in expected.items():
        assert (name, entity_type) in found, (
            f"Expected {name} to be a {entity_type}; found {sorted(found)}"
        )


def test_go_distinguishes_a_struct_from_an_interface() -> None:
    # Both are `type X ...` in the grammar; the wrapped node decides the kind.
    entities = get_ast_parser().parse(GO_SOURCE, ".go")

    kinds = {(entity.name, entity.entity_type) for entity in entities}
    assert ("Repository", "struct") in kinds
    assert ("Finder", "interface") in kinds


def test_every_registered_extension_has_a_declaration_map() -> None:
    parser = get_ast_parser()

    for extension in parser.supported_extensions:
        assert parser.parse("", extension) == [], f"{extension} failed to parse"


def test_unsupported_extension_yields_nothing() -> None:
    assert get_ast_parser().parse("SELECT 1;", ".sql") == []


def test_malformed_source_does_not_raise() -> None:
    # tree-sitter is error-tolerant; the point is that we never propagate.
    assert isinstance(get_ast_parser().parse("def (((", ".py"), list)


def test_extract_code_entities_keys_by_source_path() -> None:
    document = Document(
        page_content=PYTHON_SOURCE,
        metadata={"source": "/repo/app.py", "extension": ".py"},
    )

    entities = extract_code_entities([document])

    assert "/repo/app.py" in entities


def test_metadata_only_records_symbols_present_in_the_chunk() -> None:
    documents = [
        Document(
            page_content=PYTHON_SOURCE,
            metadata={"source": "/repo/app.py", "extension": ".py"},
        )
    ]
    entities = extract_code_entities(documents)

    chunk = Document(
        page_content="def standalone(value: int) -> int:\n    return value\n",
        metadata={"source": "/repo/app.py", "start_index": 120},
    )
    add_entities_to_metadata([chunk], entities)

    recorded = {item["name"] for item in json.loads(chunk.metadata["code_entities"])}
    assert recorded == {"standalone"}
    assert chunk.metadata["entity_count"] == 1


def test_chunks_from_unknown_files_are_left_untouched() -> None:
    chunk = Document(page_content="x = 1", metadata={"source": "/other.py"})

    add_entities_to_metadata([chunk], {})

    assert "code_entities" not in chunk.metadata
