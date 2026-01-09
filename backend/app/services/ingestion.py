import os
import sys

# Ensure UTF-8 output for Windows console
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from typing import List
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
from langchain_core.documents import Document
from app.db.chroma import get_vector_store

# Supported extensions for code files
SUPPORTED_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".md", ".txt", 
    ".java", ".go", ".cpp", ".c", ".h", ".cs", ".php", ".rb", ".rs", ".swift", ".kt"
}

# Directories to ignore
IGNORED_DIRS = {
    ".git", "node_modules", "__pycache__", "venv", "env", ".idea", ".vscode", "dist", "build", "coverage"
}

# Batch processing configuration
BATCH_SIZE = 166  # Safe batch size for ChromaDB (limit ~5000)
BATCH_DELETE_LIMIT = 5000  # Maximum IDs to delete in one batch

def is_valid_file(file_path: str) -> bool:
    ext = os.path.splitext(file_path)[1]
    return ext in SUPPORTED_EXTENSIONS

def detect_language(extension: str) -> str:
    """Detect programming language from file extension"""
    lang_map = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".java": "java",
        ".go": "go",
        ".cpp": "cpp",
        ".c": "c",
        ".h": "c",
        ".cs": "csharp",
        ".php": "php",
        ".rb": "ruby",
        ".rs": "rust",
        ".swift": "swift",
        ".kt": "kotlin",
        ".md": "markdown",
        ".txt": "text",
    }
    return lang_map.get(extension, "unknown")

def get_code_aware_splitter(extension: str) -> RecursiveCharacterTextSplitter:
    """Get language-specific code splitter for better chunking"""
    lang_splitter_map = {
        ".py": Language.PYTHON,
        ".js": Language.JS,
        ".jsx": Language.JS,
        ".ts": Language.TS,
        ".tsx": Language.TS,
        ".java": Language.JAVA,
        ".cpp": Language.CPP,
        ".c": Language.CPP,
        ".go": Language.GO,
        ".rs": Language.RUST,
        ".md": Language.MARKDOWN,
    }
    
    try:
        if extension in lang_splitter_map:
            return RecursiveCharacterTextSplitter.from_language(
                language=lang_splitter_map[extension],
                chunk_size=1000,
                chunk_overlap=200,
            )
    except Exception as e:
        print(f"⚠️  Language splitter failed for {extension}: {e}")
    
    # Fallback to generic splitter
    return RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )

def load_documents(repo_path: str) -> List[Document]:
    documents = []
    for root, dirs, files in os.walk(repo_path):
        # Modify dirs in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        
        for file in files:
            file_path = os.path.join(root, file)
            if is_valid_file(file_path):
                try:
                    ext = os.path.splitext(file_path)[1]
                    loader = TextLoader(file_path, encoding="utf-8", autodetect_encoding=True)
                    docs = loader.load()
                    
                    # Add enriched metadata
                    for doc in docs:
                        doc.metadata["source"] = file_path
                        doc.metadata["filename"] = file
                        doc.metadata["extension"] = ext
                        doc.metadata["language"] = detect_language(ext)
                        doc.metadata["relative_path"] = os.path.relpath(file_path, repo_path)
                    
                    documents.extend(docs)
                except Exception as e:
                    print(f"Error loading file {file_path}: {e}")
                    continue
    return documents

def ingest_repository(repo_path: str) -> dict:
    """
    Ingests a repository from the given path into ChromaDB.
    """
    print("\n" + "="*60)
    print("🚀 STARTING REPOSITORY INGESTION")
    print("="*60)
    
    if not os.path.exists(repo_path):
        print(f"❌ ERROR: Repository path not found: {repo_path}")
        raise FileNotFoundError(f"Repository path not found: {repo_path}")
    
    print(f"📂 Repository: {repo_path}")

    # 1. Load Documents
    print("\n📖 STEP 1/3: Loading documents...")
    raw_documents = load_documents(repo_path)
    if not raw_documents:
        print("⚠️  No valid documents found")
        return {"message": "No valid documents found in the repository.", "count": 0}
    
    print(f"✅ Loaded {len(raw_documents)} files")

    # 2. Split Text with Code-Aware Chunking
    print("\n✂️  STEP 2/3: Code-aware chunking...")
    chunks = []
    
    # Group documents by extension for efficient processing
    from collections import defaultdict
    docs_by_ext = defaultdict(list)
    for doc in raw_documents:
        ext = doc.metadata.get("extension", ".txt")
        docs_by_ext[ext].append(doc)
    
    # Process each extension group with appropriate splitter
    for ext, docs in docs_by_ext.items():
        splitter = get_code_aware_splitter(ext)
        lang = detect_language(ext)
        ext_chunks = splitter.split_documents(docs)
        chunks.extend(ext_chunks)
        print(f"   💎 {lang.capitalize():12} → {len(ext_chunks):4} chunks from {len(docs):3} files")
    
    print(f"✅ Total chunks: {len(chunks)}")

    # 3. Store in Vector DB
    print("\n💾 STEP 3/3: Storing in ChromaDB...")
    vector_store = get_vector_store()
    
    # Clear existing documents to support repository switching
    print("🧹 Clearing old repository data...")
    try:
        existing_docs = vector_store.get()
        ids_to_delete = existing_docs.get('ids', [])
        
        if ids_to_delete:
            print(f"   🗑️  Deleting {len(ids_to_delete)} existing chunks...")
            # Delete in batches for large datasets
            for i in range(0, len(ids_to_delete), BATCH_DELETE_LIMIT):
                batch_ids = ids_to_delete[i : i + BATCH_DELETE_LIMIT]
                vector_store.delete(batch_ids)
            print("   ✅ Old data cleared")
        else:
            print("   ℹ️  No existing data (fresh database)")
    except Exception as e:
        print(f"   ⚠️  Cleanup warning: {e}")

    # Add documents to the store in batches
    print(f"📥 Adding {len(chunks)} chunks to vector store...")
    try:
        if chunks:
            total_chunks = len(chunks)
            batch_count = (total_chunks + BATCH_SIZE - 1) // BATCH_SIZE
            for i in range(0, total_chunks, BATCH_SIZE):
                batch = chunks[i : i + BATCH_SIZE]
                batch_num = i // BATCH_SIZE + 1
                print(f"   📦 Batch {batch_num}/{batch_count}: {len(batch)} chunks")
                vector_store.add_documents(batch)
            print("   ✅ All chunks stored successfully")
        else:
            print("   ⚠️  No chunks to add")
    except Exception as e:
        print(f"   ❌ Failed to add documents: {e}")
        raise

    print("\n" + "="*60)
    print(f"🎉 INGESTION COMPLETE!")
    print(f"   📁 Files: {len(raw_documents)}")
    print(f"   🧩 Chunks: {len(chunks)}")
    print("="*60 + "\n")
    return {"message": "Ingestion successful", "chunks_count": len(chunks), "files_count": len(raw_documents)}
