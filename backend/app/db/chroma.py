import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from app.core.config import settings

def get_vector_store():
    """
    Yerel kalıcılık (persistence) ile ChromaDB vektör deposu örneğini döndürür.
    Bu fonksiyon, belgelerin vektör temsillerini saklamak ve sorgulamak için kullanılır.
    """
    # Yerel bir model kullanarak gömme (embedding) fonksiyonunu başlat
    embedding_function = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL_NAME)
    
    # Chroma veritabanını başlat
    # persist_directory: Verilerin diskte saklanacağı klasör
    # collection_name: Veritabanındaki koleksiyon adı
    vector_store = Chroma(
        persist_directory=settings.CHROMA_DB_DIR,
        embedding_function=embedding_function,
        collection_name="codescope_codebase"
    )
    
    return vector_store

