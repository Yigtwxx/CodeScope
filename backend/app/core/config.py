import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """
    Uygulama genelinde kullanılan yapılandırma ayarlarını tutan sınıf.
    Çevresel değişkenlerden (environment variables) değerleri okur.
    """
    PROJECT_NAME: str = "CodeScope" # Proje adı
    VERSION: str = "0.1.0" # Proje sürümü
    API_V1_STR: str = "/api" # API versiyon öneki
    
    # ChromaDB'nin kalıcı olarak saklanacağı dizin yolu
    # Backend kök dizininde 'chroma_db' klasörü altında saklanır
    CHROMA_DB_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "chroma_db")
    
    # Yerel olarak kullanılacak gömme (embedding) modeli
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    
    # Ollama Base URL (Yerel LLM servisi bağlantı adresi)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3" # Kullanılacak Ollama modeli

    class Config:
        # Çevresel değişkenlerin büyük/küçük harf duyarlılığını ayarlar
        env_case_sensitive = True

# Ayarlar sınıfından bir örnek oluşturup dışa aktarıyoruz
settings = Settings()

