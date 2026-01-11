"""
Code Intelligence Service - AST parsing to extract functions, classes, and code entities.
"""
from typing import List, Dict, Any
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser
from langchain_core.documents import Document


# Initialize tree-sitter languages
PY_LANGUAGE = Language(tspython.language())
JS_LANGUAGE = Language(tsjavascript.language())
TS_LANGUAGE = Language(tstypescript.language_typescript())


class CodeEntity:
    """Represents a code entity (function, class, etc.)"""
    
    def __init__(self, entity_type: str, name: str, start_line: int, end_line: int, file_path: str):
        self.entity_type = entity_type
        self.name = name
        self.start_line = start_line
        self.end_line = end_line
        self.file_path = file_path
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'type': self.entity_type,
            'name': self.name,
            'start_line': self.start_line,
            'end_line': self.end_line,
            'file_path': self.file_path
        }


class ASTParser:
    """Parse source code and extract entities using tree-sitter."""
    
    def __init__(self):
        self.parsers = {
            '.py': self._create_parser(PY_LANGUAGE),
            '.js': self._create_parser(JS_LANGUAGE),
            '.jsx': self._create_parser(JS_LANGUAGE),
            '.ts': self._create_parser(TS_LANGUAGE),
            '.tsx': self._create_parser(TS_LANGUAGE),
        }
    
    def _create_parser(self, language: Language) -> Parser:
        """Create a tree-sitter parser for a language."""
        parser = Parser(language)
        return parser
    
    def parse_python(self, source_code: bytes, file_path: str) -> List[CodeEntity]:
        """Extract functions and classes from Python code."""
        parser = self.parsers.get('.py')
        if not parser:
            return []
        
        tree = parser.parse(source_code)
        root_node = tree.root_node
        
        entities = []
        
        # Query for functions and classes
        def traverse(node):
            if node.type == 'function_definition':
                # Extract function name
                name_node = node.child_by_field_name('name')
                if name_node:
                    entities.append(CodeEntity(
                        entity_type='function',
                        name=source_code[name_node.start_byte:name_node.end_byte].decode('utf-8'),
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        file_path=file_path
                    ))
            
            elif node.type == 'class_definition':
                # Extract class name
                name_node = node.child_by_field_name('name')
                if name_node:
                    entities.append(CodeEntity(
                        entity_type='class',
                        name=source_code[name_node.start_byte:name_node.end_byte].decode('utf-8'),
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        file_path=file_path
                    ))
            
            # Recurse into children
            for child in node.children:
                traverse(child)
        
        traverse(root_node)
        return entities
    
    def parse_javascript(self, source_code: bytes, file_path: str) -> List[CodeEntity]:
        """Extract functions and classes from JavaScript/TypeScript code."""
        extension = '.ts' if file_path.endswith(('.ts', '.tsx')) else '.js'
        parser = self.parsers.get(extension)
        if not parser:
            return []
        
        tree = parser.parse(source_code)
        root_node = tree.root_node
        
        entities = []
        
        def traverse(node):
            # Function declarations
            if node.type in ['function_declaration', 'function']:
                name_node = node.child_by_field_name('name')
                if name_node:
                    entities.append(CodeEntity(
                        entity_type='function',
                        name=source_code[name_node.start_byte:name_node.end_byte].decode('utf-8'),
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        file_path=file_path
                    ))
            
            # Arrow functions assigned to variables
            elif node.type == 'lexical_declaration':
                # Look for: const myFunc = () => {}
                for child in node.children:
                    if child.type == 'variable_declarator':
                        name_node = child.child_by_field_name('name')
                        value_node = child.child_by_field_name('value')
                        if name_node and value_node and value_node.type in ['arrow_function', 'function']:
                            entities.append(CodeEntity(
                                entity_type='function',
                                name=source_code[name_node.start_byte:name_node.end_byte].decode('utf-8'),
                                start_line=node.start_point[0] + 1,
                                end_line=node.end_point[0] + 1,
                                file_path=file_path
                            ))
            
            # Class declarations
            elif node.type == 'class_declaration':
                name_node = node.child_by_field_name('name')
                if name_node:
                    entities.append(CodeEntity(
                        entity_type='class',
                        name=source_code[name_node.start_byte:name_node.end_byte].decode('utf-8'),
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        file_path=file_path
                    ))
            
            # Recurse
            for child in node.children:
                traverse(child)
        
        traverse(root_node)
        return entities
    
    def parse_file(self, source_code: str, file_path: str, extension: str) -> List[CodeEntity]:
        """
        Parse a file and extract code entities.
        
        Args:
            source_code: Source code as string
            file_path: Path to the file
            extension: File extension (e.g., '.py', '.js')
        
        Returns:
            List of extracted code entities
        """
        try:
            source_bytes = source_code.encode('utf-8')
            
            if extension == '.py':
                return self.parse_python(source_bytes, file_path)
            elif extension in ['.js', '.jsx', '.ts', '.tsx']:
                return self.parse_javascript(source_bytes, file_path)
            else:
                return []
        
        except Exception as e:
            print(f"⚠️  AST parsing failed for {file_path}: {e}")
            return []


# Global parser instance
_ast_parser = None

def get_ast_parser() -> ASTParser:
    """Get or create global AST parser instance."""
    global _ast_parser
    if _ast_parser is None:
        _ast_parser = ASTParser()
    return _ast_parser


def extract_code_entities(documents: List[Document]) -> Dict[str, List[CodeEntity]]:
    """
    Extract code entities (functions, classes) from documents.
    
    Args:
        documents: List of documents to parse
    
    Returns:
        Dictionary mapping file paths to lists of entities
    """
    parser = get_ast_parser()
    entities_by_file = {}
    
    total_functions = 0
    total_classes = 0
    
    for doc in documents:
        file_path = doc.metadata.get('source', '')
        extension = doc.metadata.get('extension', '')
        
        # Only parse supported languages
        if extension not in ['.py', '.js', '.jsx', '.ts', '.tsx']:
            continue
        
        entities = parser.parse_file(doc.page_content, file_path, extension)
        
        if entities:
            entities_by_file[file_path] = entities
            # Count entities
            for entity in entities:
                if entity.entity_type == 'function':
                    total_functions += 1
                elif entity.entity_type == 'class':
                    total_classes += 1
    
    if total_functions > 0 or total_classes > 0:
        print(f"🧠 Code Intelligence: Extracted {total_functions} functions, {total_classes} classes from {len(entities_by_file)} files")
    
    return entities_by_file


def add_entities_to_metadata(chunks: List[Document], entities_by_file: Dict[str, List[CodeEntity]]) -> List[Document]:
    """
    Add extracted code entities to chunk metadata.
    
    Args:
        chunks: Document chunks
        entities_by_file: Entities organized by file
    
    Returns:
        Chunks with enriched metadata
    """
    for chunk in chunks:
        file_path = chunk.metadata.get('source', '')
        
        if file_path in entities_by_file:
            # Find entities that overlap with this chunk's line range
            # (This requires adding line info to chunks, which we'll skip for now)
            # For simplicity, just add all entities from the file
            entities = entities_by_file[file_path]
            chunk.metadata['code_entities'] = [e.to_dict() for e in entities]
            chunk.metadata['has_code_intelligence'] = True
    
    return chunks
