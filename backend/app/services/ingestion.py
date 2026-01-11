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

def ingest_repository_stream(repo_path: str):
    """
    Ingests a repository and yields progress updates.
    """
    yield "📦 Starting repository ingestion...\n"
    print("\n" + "="*60)
    print("🚀 STARTING REPOSITORY INGESTION")
    print("="*60)
    
    if not os.path.exists(repo_path):
        error_msg = f"❌ ERROR: Repository path not found: {repo_path}"
        print(error_msg)
        yield error_msg + "\n"
        return
    
    print(f"📂 Repository: {repo_path}")
    yield f"📂 Repository: {repo_path}\n"

    # 1. Load Documents
    step_msg = "\n📖 STEP 1/3: Loading documents..."
    print(step_msg)
    yield step_msg + "\n"
    
    raw_documents = load_documents(repo_path)
    if not raw_documents:
        error_msg = "⚠️  No valid documents found"
        print(error_msg)
        yield error_msg + "\n"
        return
    
    success_msg = f"✅ Loaded {len(raw_documents)} files"
    print(success_msg)
    yield success_msg + "\n"

    # 2. Split Text with Code-Aware Chunking
    step_msg = "\n✂️  STEP 2/3: Code-aware chunking..."
    print(step_msg)
    yield step_msg + "\n"
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
    
    total_msg = f"✅ Total chunks: {len(chunks)}"
    print(total_msg)
    yield total_msg + "\n"
    
    # 2.5. Extract Code Intelligence (AST Parsing)
    try:
        from app.services.code_intelligence import extract_code_entities, add_entities_to_metadata
        print("\n🧠 Extracting code intelligence (functions, classes)...")
        yield "\n🧠 Extracting code intelligence...\n"
        
        entities_by_file = extract_code_entities(raw_documents)
        if entities_by_file:
            chunks = add_entities_to_metadata(chunks, entities_by_file)
            yield "✅ Code intelligence extracted\n"
    except Exception as e:
        print(f"⚠️  Code intelligence failed (non-critical): {e}")
        yield f"⚠️  Code intelligence skipped: {str(e)}\n"

    # 3. Store in Vector DB
    step_msg = "\n💾 STEP 3/3: Storing in ChromaDB..."
    print(step_msg)
    yield step_msg + "\n"
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

    complete_msg = "\n" + "="*60 + "\n🎉 INGESTION COMPLETE!\n" + f"   📁 Files: {len(raw_documents)}\n" + f"   🧩 Chunks: {len(chunks)}\n" + "="*60
    print(complete_msg)
    yield complete_msg + "\n"
