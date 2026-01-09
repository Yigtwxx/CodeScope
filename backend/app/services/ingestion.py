import os
import sys

# Ensure UTF-8 output for Windows console
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from typing import List
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
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

def load_documents(repo_path: str) -> List[Document]:
    documents = []
    for root, dirs, files in os.walk(repo_path):
        # Modify dirs in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        
        for file in files:
            file_path = os.path.join(root, file)
            if is_valid_file(file_path):
                try:
                    loader = TextLoader(file_path, encoding="utf-8", autodetect_encoding=True)
                    docs = loader.load()
                    # Add metadata about source
                    for doc in docs:
                        doc.metadata["source"] = file_path
                        doc.metadata["filename"] = file
                    documents.extend(docs)
                except Exception as e:
                    print(f"Error loading file {file_path}: {e}")
                    continue
    return documents

def ingest_repository(repo_path: str) -> dict:
    """
    Ingests a repository from the given path into ChromaDB.
    """
    if not os.path.exists(repo_path):
        raise FileNotFoundError(f"Repository path not found: {repo_path}")

    # 1. Load Documents
    raw_documents = load_documents(repo_path)
    if not raw_documents:
        return {"message": "No valid documents found in the repository.", "count": 0}

    # 2. Split Text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )
    chunks = text_splitter.split_documents(raw_documents)

    # 3. Store in Vector DB
    vector_store = get_vector_store()
    
    # Clear existing documents to support repository switching
    print("🧹 Clearing existing documents...")
    try:
        existing_docs = vector_store.get()
        ids_to_delete = existing_docs.get('ids', [])
        
        if ids_to_delete:
            print(f"🗑️  Deleting {len(ids_to_delete)} existing documents...")
            # Delete in batches for large datasets
            for i in range(0, len(ids_to_delete), BATCH_DELETE_LIMIT):
                batch_ids = ids_to_delete[i : i + BATCH_DELETE_LIMIT]
                vector_store.delete(batch_ids)
            print("✅ Existing documents cleared")
        else:
            print("ℹ️  No existing documents to clear")
    except Exception as e:
        print(f"⚠️  Cleanup warning: {e}")
        # Continue anyway - collection might be new or corrupted

    # Add documents to the store in batches
    print(f"📥 Adding {len(chunks)} chunks to vector store...")
    try:
        if chunks:
            total_chunks = len(chunks)
            for i in range(0, total_chunks, BATCH_SIZE):
                batch = chunks[i : i + BATCH_SIZE]
                print(f"   Batch {i // BATCH_SIZE + 1}: {len(batch)} chunks")
                vector_store.add_documents(batch)
            print("✅ All documents added successfully")
        else:
            print("⚠️  No chunks to add")
    except Exception as e:
        print(f"❌ Failed to add documents: {e}")
        raise

    print(f"✨ Ingestion complete! Files: {len(raw_documents)}, Chunks: {len(chunks)}")
    return {"message": "Ingestion successful", "chunks_count": len(chunks), "files_count": len(raw_documents)}
