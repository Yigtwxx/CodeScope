from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services.ingestion import ingest_repository_stream
from app.services.rag import chat_stream

router = APIRouter()

# Depo alımı (ingestion) isteği için veri modeli
class IngestRequest(BaseModel):
    repo_path: str # Deponun dosya yolu

# Sohbet isteği için veri modeli
class ChatRequest(BaseModel):
    message: str # Kullanıcı mesajı

@router.post("/ingest")
async def ingest_endpoint(request: IngestRequest):
    """
    Belirtilen depoyu işleyip veritabanına ekleyen endpoint.
    İşlem durumunu canlı olarak (stream) istemciye bildirir.
    """
    try:
        print(f"\n🌐 API REQUEST: /ingest")
        print(f"📂 Path: {request.repo_path}")
        
        # Yolun var olup olmadığını hızlıca kontrol et
        import os
        if not os.path.exists(request.repo_path):
             raise HTTPException(status_code=404, detail="Path not found")

        # İlerleme durumunu stream olarak döndür
        return StreamingResponse(
            ingest_repository_stream(request.repo_path),
            media_type="text/event-stream"
        )
    except Exception as e:
        print(f"❌ Ingestion setup failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Kullanıcı mesajını alıp RAG (Retrieval-Augmented Generation) 
    üzerinden cevap üreten ve cevabı parça parça (stream) döndüren endpoint.
    """
    print(f"\n💬 API REQUEST: /chat")
    print(f"📝 Message: {request.message[:50]}{'...' if len(request.message) > 50 else ''}")
    return StreamingResponse(chat_stream(request.message), media_type="text/event-stream")

# Arama istekleri için veri modeli
class SearchRequest(BaseModel):
    query: str # Arama sorgusu
    repo_path: str # Aranacak depo yolu
    threshold: int = 70  # Sadece bulanık arama için eşik değeri

@router.post("/search/regex")
async def regex_search_endpoint(request: SearchRequest):
    """
    Regex (Düzenli İfade) kullanarak depoda arama yapan endpoint.
    """
    try:
        from app.services.code_search import regex_search
        
        if not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        results = regex_search(request.query, request.repo_path)
        
        return {
            "results": [r.to_dict() for r in results],
            "total_matches": len(results),
            "query": request.query,
            "search_type": "regex"
        }
    except ValueError as e:
        # Geçersiz regex deseni hatası
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@router.post("/search/fuzzy")
async def fuzzy_search_endpoint(request: SearchRequest):
    """
    Bulanık eşleştirme (fuzzy matching) kullanarak depoda arama yapan endpoint.
    Kullanıcı hatalarını tolere ederek benzer sonuçları bulur.
    """
    try:
        from app.services.code_search import fuzzy_search
        
        if not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        # Eşik değeri doğrulaması (0-100 arası)
        if not (0 <= request.threshold <= 100):
            raise HTTPException(status_code=400, detail="Threshold must be between 0 and 100")
        
        results = fuzzy_search(request.query, request.repo_path, request.threshold)
        
        return {
            "results": [r.to_dict() for r in results],
            "total_matches": len(results),
            "query": request.query,
            "search_type": "fuzzy",
            "threshold": request.threshold
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

