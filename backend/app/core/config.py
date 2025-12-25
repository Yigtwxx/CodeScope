import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "CodeScope"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api"
    
    # Path to persist ChromaDB
    # We'll store it in the backend root under 'chroma_db'
    CHROMA_DB_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "chroma_db")
    
    # Embedding model to use locally
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    
    # Ollama Base URL
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    class Config:
        env_case_sensitive = True

settings = Settings()
