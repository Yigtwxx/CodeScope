import os
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
    
    # Clear existing documents to support "switching" repos
    try:
        print("DEBUG: entering ingestion cleanup...")
        print("DEBUG: calling delete_collection()...")
        # delete_collection() is the most robust way to nuke everything
        try:
            vector_store.delete_collection()
            print("DEBUG: delete_collection() returned.")
        except ValueError:
            # Collection might not exist, which is fine
            print("DEBUG: Collection did not exist, skipping delete.")
        except Exception as e:
            print(f"DEBUG: delete_collection error: {e}")

        print("DEBUG: Collection deleted/checked. Re-initializing vector store...")
        
        # We must re-initialize the vector store because the collection object is now invalid
        vector_store = get_vector_store()
        print("DEBUG: vector_store re-initialized.")

    except Exception as e:
        print(f"Warning: delete_collection logic failed: {e}")

    # Add documents to the store
    print(f"DEBUG: Adding {len(chunks)} chunks to vector store...")
    # Note: simple add_documents usage. For large repos, might need batching.
    try:
        if chunks:
            vector_store.add_documents(chunks)
            print("DEBUG: add_documents completed.")
        else:
            print("DEBUG: No chunks to add.")
    except Exception as e:
        print(f"ERROR: add_documents failed: {e}")
        raise e

    return {"message": "Ingestion successful", "chunks_count": len(chunks), "files_count": len(raw_documents)}
