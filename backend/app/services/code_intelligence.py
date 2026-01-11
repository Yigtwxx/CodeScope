"""
Code Intelligence Service - AST (Soyut Sözdizimi Ağacı) analizcisi.
Fonksiyon ve sınıf tanımlarını koddan çıkarmak için kullanılır.
"""
import json
from typing import List, Dict, Any
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser
from langchain_core.documents import Document


# Tree-sitter dillerini başlat (Python, JS, TS)
PY_LANGUAGE = Language(tspython.language())
JS_LANGUAGE = Language(tsjavascript.language())
TS_LANGUAGE = Language(tstypescript.language_typescript())


class CodeEntity:
    """Kod varlığını temsil eder (fonksiyon, sınıf vb.)"""
    
    def __init__(self, entity_type: str, name: str, start_line: int, end_line: int, file_path: str):
        self.entity_type = entity_type # Varlık türü (function, class)
        self.name = name # Varlığın adı
        self.start_line = start_line # Başlangıç satırı
        self.end_line = end_line # Bitiş satırı
        self.file_path = file_path # Dosya yolu
    
    def to_dict(self) -> Dict[str, Any]:
        """Sınıfı sözlük yapısına çevirir."""
        return {
            'type': self.entity_type,
            'name': self.name,
            'start_line': self.start_line,
            'end_line': self.end_line,
            'file_path': self.file_path
        }


class ASTParser:
    """Kaynak kodunu işler ve tree-sitter kullanarak varlıkları çıkarır."""
    
    def __init__(self):
        # Desteklenen diller için ayrıştırıcıları (parsers) oluştur
        self.parsers = {
            '.py': self._create_parser(PY_LANGUAGE),
            '.js': self._create_parser(JS_LANGUAGE),
            '.jsx': self._create_parser(JS_LANGUAGE),
            '.ts': self._create_parser(TS_LANGUAGE),
            '.tsx': self._create_parser(TS_LANGUAGE),
        }
    
    def _create_parser(self, language: Language) -> Parser:
        """Belirtilen dil için tree-sitter ayrıştırıcısı oluşturur."""
        parser = Parser(language)
        return parser
    
    def parse_python(self, source_code: bytes, file_path: str) -> List[CodeEntity]:
        """Python kodundan fonksiyon ve sınıfları çıkarır."""
        parser = self.parsers.get('.py')
        if not parser:
            return []
        
        tree = parser.parse(source_code)
        root_node = tree.root_node
        
        entities = []
        
        # Fonksiyon ve sınıfları bulmak için düğümleri (nodes) gez
        def traverse(node):
            if node.type == 'function_definition':
                # Fonksiyon adını al
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
                # Sınıf adını al
                name_node = node.child_by_field_name('name')
                if name_node:
                    entities.append(CodeEntity(
                        entity_type='class',
                        name=source_code[name_node.start_byte:name_node.end_byte].decode('utf-8'),
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        file_path=file_path
                    ))
            
            # Alt düğümlere (children) yinelemeli olarak git
            for child in node.children:
                traverse(child)
        
        traverse(root_node)
        return entities
    
    def parse_javascript(self, source_code: bytes, file_path: str) -> List[CodeEntity]:
        """JavaScript/TypeScript kodundan fonksiyon ve sınıfları çıkarır."""
        extension = '.ts' if file_path.endswith(('.ts', '.tsx')) else '.js'
        parser = self.parsers.get(extension)
        if not parser:
            return []
        
        tree = parser.parse(source_code)
        root_node = tree.root_node
        
        entities = []
        
        def traverse(node):
            # Fonksiyon bildirimleri
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
            
            # Değişkene atanan ok (arrow) fonksiyonlar
            elif node.type == 'lexical_declaration':
                # Örnek: const myFunc = () => {}
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
            
            # Sınıf bildirimleri
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
            
            # Yinelemeli işlem
            for child in node.children:
                traverse(child)
        
        traverse(root_node)
        return entities
    
    def parse_file(self, source_code: str, file_path: str, extension: str) -> List[CodeEntity]:
        """
        Bir dosyayı ayrıştırır ve kod varlıklarını çıkarır.
        
        Args:
            source_code: String olarak kaynak kod
            file_path: Dosyanın yolu
            extension: Dosya uzantısı (ör. '.py', '.js')
        
        Returns:
            Çıkarılan kod varlıklarının listesi
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


# Global ayrıştırıcı (parser) örneği
_ast_parser = None

def get_ast_parser() -> ASTParser:
    """Global AST parser örneğini getirir veya oluşturur."""
    global _ast_parser
    if _ast_parser is None:
        _ast_parser = ASTParser()
    return _ast_parser


def extract_code_entities(documents: List[Document]) -> Dict[str, List[CodeEntity]]:
    """
    Belgelerden (documents) kod varlıklarını (fonksiyonlar, sınıflar) çıkarır.
    
    Args:
        documents: Ayrıştırılacak belgelerin listesi
    
    Returns:
        Dosya yollarını varlık listeleriyle eşleştiren sözlük
    """
    parser = get_ast_parser()
    entities_by_file = {}
    
    total_functions = 0
    total_classes = 0
    
    for doc in documents:
        file_path = doc.metadata.get('source', '')
        extension = doc.metadata.get('extension', '')
        
        # Sadece desteklenen dilleri ayrıştır
        if extension not in ['.py', '.js', '.jsx', '.ts', '.tsx']:
            continue
        
        entities = parser.parse_file(doc.page_content, file_path, extension)
        
        if entities:
            entities_by_file[file_path] = entities
            # Varlıkları say
            for entity in entities:
                if entity.entity_type == 'function':
                    total_functions += 1
                elif entity.entity_type == 'class':
                    total_classes += 1
    
    if total_functions > 0 or total_classes > 0:
        print(f"🧠 Code Intelligence: {len(entities_by_file)} dosyadan {total_functions} fonksiyon, {total_classes} sınıf çıkarıldı")
    
    return entities_by_file


def add_entities_to_metadata(chunks: List[Document], entities_by_file: Dict[str, List[CodeEntity]]) -> List[Document]:
    """
    Çıkarılan kod varlıklarını belge parçalarının (chunks) metadatalarına ekler.
    
    Args:
        chunks: Belge parçaları
        entities_by_file: Dosyaya göre organize edilmiş varlıklar
    
    Returns:
        Zenginleştirilmiş metadataya sahip parçalar
    """
    for chunk in chunks:
        file_path = chunk.metadata.get('source', '')
        
        if file_path in entities_by_file:
            # Bu parçayla (chunk) örtüşen varlıkları bul
            # (Şimdilik basitlik adına dosyadaki tüm varlıkları ekliyoruz)
            entities = entities_by_file[file_path]
            
            # Varlıkları JSON string'e çevir (ChromaDB sadece ilkel tipleri destekler)
            chunk.metadata['code_entities'] = json.dumps([e.to_dict() for e in entities])
            chunk.metadata['entity_count'] = len(entities)
            chunk.metadata['has_code_intelligence'] = True
    
    return chunks

