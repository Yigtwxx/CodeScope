# FastAPI framework'ünü içe aktarıyoruz
from fastapi import FastAPI
# CORS (Cross-Origin Resource Sharing) ayarları için middleware
from fastapi.middleware.cors import CORSMiddleware
# Uygulama ayarlarını yapılandırma dosyasından alıyoruz
from app.core.config import settings
# API yönlendirmelerini (router) içe aktarıyoruz
from app.api.endpoints import router as api_router

# FastAPI uygulamasını başlatıyoruz, proje adı ve versiyon bilgisini ayarlardan alıyoruz
app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Başlangıç Temizliği: Temiz bir başlangıç sağlamak için mevcut vektör veritabanını temizle
import shutil
import os
import sys

# Windows üzerinde emojilerin düzgün görüntülenmesi için UTF-8 çıktısını zorla
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')


@app.on_event("startup")
async def startup_event():
    """
    Uygulama başlatıldığında çalışacak olay dinleyicisi.
    Mevcut ChromaDB kalıcılığını (persistence) kontrol eder ve temizler.
    Bu, her başlangıçta temiz bir veritabanı ile başlanmasını sağlar.
    """
    print("🧹 [Başlangıç] Temizlenecek mevcut ChromaDB kalıcılığı kontrol ediliyor...")
    db_path = settings.CHROMA_DB_DIR
    if os.path.exists(db_path):
        try:
            # Dosya mı yoksa dizin mi olduğunu kontrol et ve buna göre sil
            if os.path.isdir(db_path):
                shutil.rmtree(db_path)
            else:
                os.remove(db_path)
            print(f"✅ [Başlangıç] Mevcut kalıcılık {db_path} konumunda temizlendi")
        except Exception as e:
            print(f"⚠️  [Başlangıç] Uyarı - Kalıcılık temizlenemedi: {e}")
    else:
        print("✨ [Başlangıç] Mevcut kalıcılık bulunamadı. Sıfırdan başlanıyor.")

# Tüm CORS kaynaklarına izin ver
# Geliştirme ortamı için "*" (hepsi) kullanılır. Prodüksiyonda frontend URL'i belirtilmelidir.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dosya işlemleri için router'ı dahil ediyoruz
from app.api.files import router as files_router

# Sağlık Kontrolü (Health Check) Uç Noktası
@app.get("/health")
async def health_check():
    """Uygulamanın çalışıp çalışmadığını kontrol etmek için endpoint."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

# API rotalarını uygulamaya dahil ediyoruz
app.include_router(api_router, prefix=settings.API_V1_STR)
# Dosya işlemleri rotasını dahil ediyoruz
app.include_router(files_router, prefix="/api/files", tags=["files"])

if __name__ == "__main__":
    import uvicorn
    # Uygulamayı uvicorn sunucusu ile başlatıyoruz
    # host="0.0.0.0" tüm ağ arayüzlerinden erişimi sağlar
    # reload=True, kod değişikliklerinde sunucunun otomatik yeniden başlamasını sağlar
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    
# A

