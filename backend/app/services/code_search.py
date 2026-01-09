import os
import re
from typing import List, Dict, Any
from pathlib import Path
from rapidfuzz import fuzz
from app.core.config import settings

class SearchResult:
    """Represents a single search result"""
    def __init__(self, file_path: str, line_number: int, line_content: str, context_before: List[str] = None, context_after: List[str] = None):
        self.file_path = file_path
        self.line_number = line_number
        self.line_content = line_content
        self.context_before = context_before or []
        self.context_after = context_after or []
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "file": self.file_path,
            "line_number": self.line_number,
            "line_content": self.line_content,
            "context_before": self.context_before,
            "context_after": self.context_after
        }

# File extensions to search
SEARCHABLE_EXTENSIONS = {
    '.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.cpp', '.c', '.h', 
    '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.m', '.mm',
    '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
    '.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.cfg',
    '.md', '.txt', '.rst', '.adoc', '.tex',
    '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd'
}

# Directories to ignore
IGNORE_DIRS = {
    'node_modules', '.git', '.venv', 'venv', '__pycache__', 
    '.next', 'dist', 'build', 'out', '.cache', 'coverage',
    'vendor', 'env', '.env', 'tmp', 'temp'
}

def should_ignore_path(path: Path) -> bool:
    """Check if a path should be ignored"""
    parts = path.parts
    return any(ignored in parts for ignored in IGNORE_DIRS)

def is_searchable_file(file_path: Path) -> bool:
    """Check if a file should be searched"""
    if should_ignore_path(file_path):
        return False
    
    # Check extension
    if file_path.suffix.lower() not in SEARCHABLE_EXTENSIONS:
        return False
    
    # Check file size (skip files > 5MB)
    try:
        if file_path.stat().st_size > 5 * 1024 * 1024:
            return False
    except:
        return False
    
    return True

def get_file_context(lines: List[str], line_idx: int, context_lines: int = 2) -> tuple[List[str], List[str]]:
    """Get context lines before and after a match"""
    before = lines[max(0, line_idx - context_lines):line_idx]
    after = lines[line_idx + 1:min(len(lines), line_idx + 1 + context_lines)]
    return before, after

def regex_search(pattern: str, repo_path: str, max_results: int = 100) -> List[SearchResult]:
    """
    Search for a regex pattern in the repository
    
    Args:
        pattern: Regular expression pattern to search for
        repo_path: Path to the repository
        max_results: Maximum number of results to return
    
    Returns:
        List of SearchResult objects
    """
    results = []
    
    # Normalize path and ensure it exists
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
        # Compile regex pattern
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {str(e)}")
    
    # Walk through repository
    file_count = 0
    for file_path in repo.rglob('*'):
        # Stop if we've checked too many files
        if file_count >= 10000:
            break
        
        if not file_path.is_file():
            continue
        
        if not is_searchable_file(file_path):
            continue
        
        file_count += 1
        
        try:
            # Read file content
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            # Search each line
            for line_idx, line in enumerate(lines):
                if regex.search(line):
                    # Get context
                    before, after = get_file_context(lines, line_idx)
                    
                    # Create result
                    result = SearchResult(
                        file_path=str(file_path.relative_to(repo)),
                        line_number=line_idx + 1,
                        line_content=line.rstrip('\n'),
                        context_before=[l.rstrip('\n') for l in before],
                        context_after=[l.rstrip('\n') for l in after]
                    )
                    results.append(result)
                    
                    # Stop if we have enough results
                    if len(results) >= max_results:
                        return results
        
        except Exception as e:
            # Skip files that can't be read
            continue
    
    return results

def fuzzy_search(query: str, repo_path: str, threshold: int = 70, max_results: int = 100) -> List[SearchResult]:
    """
    Search for fuzzy matches in the repository
    
    Args:
        query: Query string to search for
        repo_path: Path to the repository
        threshold: Minimum similarity score (0-100)
        max_results: Maximum number of results to return
    
    Returns:
        List of SearchResult objects sorted by similarity score
    """
    results_with_scores = []
    
    # Normalize path and ensure it exists
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
    
    # Walk through repository
    file_count = 0
    for file_path in repo.rglob('*'):
        # Stop if we've checked too many files
        if file_count >= 10000:
            break
        
        if not file_path.is_file():
            continue
        
        if not is_searchable_file(file_path):
            continue
        
        file_count += 1
        
        try:
            # Read file content
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            # Search each line
            for line_idx, line in enumerate(lines):
                # Calculate similarity score
                score = fuzz.partial_ratio(query.lower(), line.lower())
                
                if score >= threshold:
                    # Get context
                    before, after = get_file_context(lines, line_idx)
                    
                    # Create result with score
                    result = SearchResult(
                        file_path=str(file_path.relative_to(repo)),
                        line_number=line_idx + 1,
                        line_content=line.rstrip('\n'),
                        context_before=[l.rstrip('\n') for l in before],
                        context_after=[l.rstrip('\n') for l in after]
                    )
                    results_with_scores.append((result, score))
                    
                    # Stop if we have too many results (we'll sort and trim later)
                    if len(results_with_scores) >= max_results * 2:
                        break
        
        except Exception as e:
            # Skip files that can't be read
            continue
    
    # Sort by score (highest first) and take top results
    results_with_scores.sort(key=lambda x: x[1], reverse=True)
    return [result for result, score in results_with_scores[:max_results]]
