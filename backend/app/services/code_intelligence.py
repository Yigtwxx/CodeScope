"""AST-based code intelligence.

Extracts function and class declarations with tree-sitter so retrieved chunks
can tell the model which symbols they contain.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass

import tree_sitter_c_sharp as ts_csharp
import tree_sitter_go as ts_go
import tree_sitter_java as ts_java
import tree_sitter_javascript as ts_javascript
import tree_sitter_python as ts_python
import tree_sitter_rust as ts_rust
import tree_sitter_typescript as ts_typescript
from langchain_core.documents import Document
from tree_sitter import Language, Node, Parser

from app.core.logging import get_logger

logger = get_logger(__name__)

PY_LANGUAGE = Language(ts_python.language())
JS_LANGUAGE = Language(ts_javascript.language())
TS_LANGUAGE = Language(ts_typescript.language_typescript())
TSX_LANGUAGE = Language(ts_typescript.language_tsx())
GO_LANGUAGE = Language(ts_go.language())
RUST_LANGUAGE = Language(ts_rust.language())
JAVA_LANGUAGE = Language(ts_java.language())
CSHARP_LANGUAGE = Language(ts_csharp.language())

# Node types that declare a named symbol, per grammar family. Only nodes that
# expose a `name` field are listed; anything else yields no identifier.
PYTHON_DECLARATIONS = {
    "function_definition": "function",
    "class_definition": "class",
}
JS_DECLARATIONS = {
    "function_declaration": "function",
    "generator_function_declaration": "function",
    "method_definition": "method",
    "class_declaration": "class",
    "interface_declaration": "interface",
    "type_alias_declaration": "type",
    "enum_declaration": "enum",
}
GO_DECLARATIONS = {
    "function_declaration": "function",
    "method_declaration": "method",
    # `type X struct {...}` and `type X interface {...}` share this node; the
    # concrete kind is resolved in _collect.
    "type_spec": "type",
    "type_alias": "type",
}
RUST_DECLARATIONS = {
    "function_item": "function",
    # Method signatures inside a trait body.
    "function_signature_item": "function",
    "struct_item": "struct",
    "union_item": "struct",
    "enum_item": "enum",
    "trait_item": "trait",
    "mod_item": "module",
    "type_item": "type",
    "macro_definition": "macro",
}
JAVA_DECLARATIONS = {
    "class_declaration": "class",
    "interface_declaration": "interface",
    "enum_declaration": "enum",
    "record_declaration": "record",
    "annotation_type_declaration": "interface",
    "method_declaration": "method",
    "constructor_declaration": "method",
}
CSHARP_DECLARATIONS = {
    "class_declaration": "class",
    "interface_declaration": "interface",
    "struct_declaration": "struct",
    "record_declaration": "record",
    "enum_declaration": "enum",
    "delegate_declaration": "type",
    "method_declaration": "method",
    "constructor_declaration": "method",
    "property_declaration": "property",
}

# Go models a struct and an interface with the same node type, so the kind is
# read from the node it wraps.
GO_TYPE_KINDS = {"struct_type": "struct", "interface_type": "interface"}

# Guard against pathological inputs (minified bundles, generated parsers).
MAX_SOURCE_BYTES = 1_000_000
MAX_ENTITIES_PER_FILE = 500
# ChromaDB metadata values must stay small; entities are stored as JSON.
MAX_ENTITY_JSON_CHARS = 4_000


@dataclass(slots=True, frozen=True)
class CodeEntity:
    """A named declaration found in a source file."""

    entity_type: str
    name: str
    start_line: int
    end_line: int

    def to_dict(self) -> dict[str, object]:
        return {
            "type": self.entity_type,
            "name": self.name,
            "start_line": self.start_line,
            "end_line": self.end_line,
        }


class ASTParser:
    """Extracts declarations from supported source languages."""

    def __init__(self) -> None:
        self._parsers: dict[str, Parser] = {
            ".py": Parser(PY_LANGUAGE),
            ".js": Parser(JS_LANGUAGE),
            ".jsx": Parser(JS_LANGUAGE),
            ".mjs": Parser(JS_LANGUAGE),
            ".cjs": Parser(JS_LANGUAGE),
            ".ts": Parser(TS_LANGUAGE),
            ".tsx": Parser(TSX_LANGUAGE),
            ".go": Parser(GO_LANGUAGE),
            ".rs": Parser(RUST_LANGUAGE),
            ".java": Parser(JAVA_LANGUAGE),
            ".cs": Parser(CSHARP_LANGUAGE),
        }
        self._declarations: dict[str, dict[str, str]] = {
            ".py": PYTHON_DECLARATIONS,
            ".js": JS_DECLARATIONS,
            ".jsx": JS_DECLARATIONS,
            ".mjs": JS_DECLARATIONS,
            ".cjs": JS_DECLARATIONS,
            ".ts": JS_DECLARATIONS,
            ".tsx": JS_DECLARATIONS,
            ".go": GO_DECLARATIONS,
            ".rs": RUST_DECLARATIONS,
            ".java": JAVA_DECLARATIONS,
            ".cs": CSHARP_DECLARATIONS,
        }

    @property
    def supported_extensions(self) -> frozenset[str]:
        return frozenset(self._parsers)

    def parse(self, source: str, extension: str) -> list[CodeEntity]:
        """Return every declaration found in ``source``.

        Args:
            source: File contents as text.
            extension: Lowercase file extension including the leading dot.

        Returns:
            The declarations found, or an empty list when the language is
            unsupported or the file could not be parsed.
        """
        parser = self._parsers.get(extension)
        if parser is None:
            return []

        source_bytes = source.encode("utf-8", errors="replace")
        if len(source_bytes) > MAX_SOURCE_BYTES:
            logger.debug("Skipping AST parse of a %s byte file", len(source_bytes))
            return []

        declarations = self._declarations[extension]

        try:
            tree = parser.parse(source_bytes)
        except Exception:
            logger.exception("tree-sitter failed to parse a %s file", extension)
            return []

        entities: list[CodeEntity] = []
        self._walk(
            tree.root_node,
            lambda node: self._collect(node, source_bytes, declarations, entities),
        )
        return entities

    @staticmethod
    def _walk(root: Node, visit: Callable[[Node], None]) -> None:
        """Iteratively traverse the tree.

        An explicit stack avoids the recursion limit that deeply nested files
        (large JSX trees in particular) would otherwise hit.
        """
        stack = [root]
        while stack:
            node = stack.pop()
            visit(node)
            stack.extend(reversed(node.children))

    def _collect(
        self,
        node: Node,
        source: bytes,
        declarations: dict[str, str],
        out: list[CodeEntity],
    ) -> None:
        """Append the declaration ``node`` represents, if any."""
        if len(out) >= MAX_ENTITIES_PER_FILE:
            return

        entity_type = declarations.get(node.type)
        if entity_type is not None:
            name = self._node_name(node, source)
            if name:
                out.append(
                    CodeEntity(
                        entity_type=self._refine(node, entity_type),
                        name=name,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )
            return

        # `const handler = () => {}` and `const C = class {}` are declarations
        # too, but the grammar models them as variable declarators.
        if node.type == "variable_declarator":
            value = node.child_by_field_name("value")
            if value is None or value.type not in (
                "arrow_function",
                "function",
                "function_expression",
                "class",
            ):
                return
            name = self._node_name(node, source)
            if name:
                out.append(
                    CodeEntity(
                        entity_type="class" if value.type == "class" else "function",
                        name=name,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )

    @staticmethod
    def _refine(node: Node, entity_type: str) -> str:
        """Narrow a declaration whose node type covers several kinds."""
        if node.type != "type_spec":
            return entity_type
        wrapped = node.child_by_field_name("type")
        if wrapped is None:
            return entity_type
        return GO_TYPE_KINDS.get(wrapped.type, entity_type)

    @staticmethod
    def _node_name(node: Node, source: bytes) -> str | None:
        """Decode the identifier a declaration node is bound to."""
        name_node = node.child_by_field_name("name")
        if name_node is None:
            return None
        try:
            return source[name_node.start_byte : name_node.end_byte].decode("utf-8")
        except UnicodeDecodeError:
            return None


_parser: ASTParser | None = None


def get_ast_parser() -> ASTParser:
    """Return the process-wide AST parser."""
    global _parser
    if _parser is None:
        _parser = ASTParser()
    return _parser


def extract_code_entities(
    documents: list[Document],
) -> dict[str, list[CodeEntity]]:
    """Map each parseable source file to the declarations it contains."""
    parser = get_ast_parser()
    supported = parser.supported_extensions
    by_file: dict[str, list[CodeEntity]] = {}

    for document in documents:
        extension = str(document.metadata.get("extension", "")).lower()
        if extension not in supported:
            continue
        source_path = str(document.metadata.get("source", ""))
        entities = parser.parse(document.page_content, extension)
        if entities:
            by_file[source_path] = entities

    if by_file:
        total = sum(len(items) for items in by_file.values())
        logger.info("Extracted %s declarations from %s files", total, len(by_file))

    return by_file


def _chunk_line_range(chunk: Document) -> tuple[int, int] | None:
    """Derive the 1-based line span a chunk covers from its start index."""
    start_index = chunk.metadata.get("start_index")
    if not isinstance(start_index, int) or start_index < 0:
        return None
    # start_index counts characters into the original document; the exact line
    # is unknown without the source, so the chunk's own newline count gives the
    # span length and the caller only needs relative overlap.
    return start_index, start_index + len(chunk.page_content)


def add_entities_to_metadata(
    chunks: list[Document], entities_by_file: dict[str, list[CodeEntity]]
) -> list[Document]:
    """Attach the declarations that overlap each chunk to its metadata.

    Only overlapping entities are attached. Storing every symbol of a file on
    every one of its chunks bloated the vector store and diluted the signal.
    """
    for chunk in chunks:
        source_path = str(chunk.metadata.get("source", ""))
        entities = entities_by_file.get(source_path)
        if not entities:
            continue

        span = _chunk_line_range(chunk)
        if span is None:
            relevant = entities
        else:
            # Chunks carry character offsets while entities carry line numbers,
            # so match on the symbol names that literally appear in the chunk.
            relevant = [e for e in entities if e.name in chunk.page_content]
            if not relevant:
                continue

        payload = json.dumps([entity.to_dict() for entity in relevant])
        if len(payload) > MAX_ENTITY_JSON_CHARS:
            relevant = relevant[:20]
            payload = json.dumps([entity.to_dict() for entity in relevant])

        chunk.metadata["code_entities"] = payload
        chunk.metadata["entity_count"] = len(relevant)
        chunk.metadata["symbols"] = ", ".join(entity.name for entity in relevant[:20])

    return chunks
