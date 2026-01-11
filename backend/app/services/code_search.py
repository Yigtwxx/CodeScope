import os
import re
from typing import List, Dict, Any
from pathlib import Path
from rapidfuzz import fuzz
from app.core.config import settings

class SearchResult:
    """Tek bir arama sonucunu temsil eder."""
    def __init__(self, file_path: str, line_number: int, line_content: str, context_before: List[str] = None, context_after: List[str] = None):
        self.file_path = file_path # Dosya yolu
        self.line_number = line_number # Eşleşmenin bulunduğu satır numarası
        self.line_content = line_content # Eşleşen satırın içeriği
        self.context_before = context_before or [] # Eşleşmeden önceki satırlar (bağlam için)
        self.context_after = context_after or [] # Eşleşmeden sonraki satırlar (bağlam için)
    
    def to_dict(self) -> Dict[str, Any]:
        """Arama sonucunu sözlük formatına çevirir."""
        return {
            "file": self.file_path,
            "line_number": self.line_number,
            "line_content": self.line_content,
            "context_before": self.context_before,
            "context_after": self.context_after
        }

# Aranabilir dosya uzantıları
SEARCHABLE_EXTENSIONS = {
    '.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.cpp', '.c', '.h', 
    '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.m', '.mm',
    '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
    '.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.cfg',
    '.md', '.txt', '.rst', '.adoc', '.tex',
    '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd'
}

# Göz ardı edilecek dizinler
IGNORE_DIRS = {
    'node_modules', '.git', '.venv', 'venv', '__pycache__', 
    '.next', 'dist', 'build', 'out', '.cache', 'coverage',
    'vendor', 'env', '.env', 'tmp', 'temp'
}

def should_ignore_path(path: Path) -> bool:
    """Yolun göz ardı edilip edilmeyeceğini kontrol eder."""
    parts = path.parts
    return any(ignored in parts for ignored in IGNORE_DIRS)

def is_searchable_file(file_path: Path) -> bool:
    """Dosyanın aranabilir olup olmadığını kontrol eder."""
    if should_ignore_path(file_path):
        return False
    
    # Uzantı kontrolü
    if file_path.suffix.lower() not in SEARCHABLE_EXTENSIONS:
        return False
    
    # Dosya boyutu kontrolü (5MB'den büyük dosyaları atla)
    try:
        if file_path.stat().st_size > 5 * 1024 * 1024:
            return False
    except:
        return False
    
    return True

def get_file_context(lines: List[str], line_idx: int, context_lines: int = 2) -> tuple[List[str], List[str]]:
    """Eşleşen satırın öncesinden ve sonrasından bağlam satırlarını alır."""
    before = lines[max(0, line_idx - context_lines):line_idx]
    after = lines[line_idx + 1:min(len(lines), line_idx + 1 + context_lines)]
    return before, after

def regex_search(pattern: str, repo_path: str, max_results: int = 100) -> List[SearchResult]:
    """
    Depoda regex (düzenli ifade) modeli kullanarak arama yapar.
    
    Args:
        pattern: Aranacak regex modeli
        repo_path: Depo yolu
        max_results: Döndürülecek maksimum sonuç sayısı
    
    Returns:
        SearchResult nesnelerinden oluşan liste
    """
    results = []
    
    # Yolu normalize et ve varlığını doğrula
    repo = Path(repo_path).resolve()
    
    print(f"🔍 [Regex Search] Starting search in: {repo}")
    print(f"🔍 [Regex Search] Pattern: {pattern}")
    
    if not repo.exists():
        print(f"❌ [Regex Search] Path does not exist: {repo}")
        return []
    
    if not repo.is_dir():
        print(f"❌ [Regex Search] Path is not a directory: {repo}")
        return []
    
    try:
        # Regex modelini derle
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {str(e)}")
    
    # Dosyaları gez
    file_count = 0
    for file_path in repo.rglob('*'):
        # Çok fazla dosya tarandıysa dur
        if file_count >= 10000:
            break
        
        if not file_path.is_file():
            continue
        
        if not is_searchable_file(file_path):
            continue
        
        file_count += 1
        
        try:
            # Dosya içeriğini oku
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            # Her satırı tara
            for line_idx, line in enumerate(lines):
                if regex.search(line):
                    # Bağlamı (önceki ve sonraki satırlar) al
                    before, after = get_file_context(lines, line_idx)
                    
                    # Sonuç oluştur
                    result = SearchResult(
                        file_path=str(file_path.relative_to(repo)),
                        line_number=line_idx + 1,
                        line_content=line.rstrip('\n'),
                        context_before=[l.rstrip('\n') for l in before],
                        context_after=[l.rstrip('\n') for l in after]
                    )
                    results.append(result)
                    
                    # Yeterli sonuç bulunduysa dur
                    if len(results) >= max_results:
                        return results
        
        except Exception as e:
            # Okunamayan dosyaları atla
            continue
    
    return results

def fuzzy_search(query: str, repo_path: str, threshold: int = 70, max_results: int = 100) -> List[SearchResult]:
    """
    Depoda bulanık (fuzzy) eşleştirme kullanarak arama yapar.
    
    Args:
        query: Aranacak sorgu metni
        repo_path: Depo yolu
        threshold: Minimum benzerlik skoru (0-100)
        max_results: Döndürülecek maksimum sonuç sayısı
    
    Returns:
        Benzerlik skoruna göre sıralanmış SearchResult listesi
    """
    results_with_scores = []
    
    # Yolu normalize et ve doğrula
    repo = Path(repo_path).resolve()
    
    print(f"⚡ [Fuzzy Search] Starting search in: {repo}")
    print(f"⚡ [Fuzzy Search] Query: {query}")
    print(f"⚡ [Fuzzy Search] Threshold: {threshold}%")
    
    if not repo.exists():
        print(f"❌ [Fuzzy Search] Path does not exist: {repo}")
        return []
    
    if not repo.is_dir():
        print(f"❌ [Fuzzy Search] Path is not a directory: {repo}")
        return []
    
    # Dosyaları gez
    file_count = 0
    for file_path in repo.rglob('*'):
        # Çok fazla dosya tarandıysa dur
        if file_count >= 10000:
            break
        
        if not file_path.is_file():
            continue
        
        if not is_searchable_file(file_path):
            continue
        
        file_count += 1
        
        try:
            # Dosya içeriğini oku
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            # Her satırı tara
            for line_idx, line in enumerate(lines):
                # Benzerlik skorunu hesapla
                score = fuzz.partial_ratio(query.lower(), line.lower())
                
                if score >= threshold:
                    # Bağlamı al
                    before, after = get_file_context(lines, line_idx)
                    
                    # Sonuç ve skor ile birlikte nesne oluştur
                    result = SearchResult(
                        file_path=str(file_path.relative_to(repo)),
                        line_number=line_idx + 1,
                        line_content=line.rstrip('\n'),
                        context_before=[l.rstrip('\n') for l in before],
                        context_after=[l.rstrip('\n') for l in after]
                    )
                    results_with_scores.append((result, score))
                    
                    # Çok fazla sonuç varsa dur (daha sonra sıralayıp kırpacağız)
                    if len(results_with_scores) >= max_results * 2:
                        break
        
        except Exception as e:
            # Okunamayan dosyaları atla
            continue
    
    # Skora göre sırala (en yüksek önce) ve en iyi sonuçları döndür
    results_with_scores.sort(key=lambda x: x[1], reverse=True)
    return [result for result, score in results_with_scores[:max_results]]

