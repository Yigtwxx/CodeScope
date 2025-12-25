import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from app.core.config import settings

def get_vector_store():
    """
    Returns the ChromaDB vector store instance with local persistence.
    """
    # Initialize the embedding function using a local model
    embedding_function = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL_NAME)
    
    # Initialize Chroma
    vector_store = Chroma(
        persist_directory=settings.CHROMA_DB_DIR,
        embedding_function=embedding_function,
        collection_name="codescope_codebase"
    )
    
    return vector_store
