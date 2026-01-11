from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os

router = APIRouter()

# Dosya yolu isteği için model
class PathRequest(BaseModel):
    path: str

@router.post("/list")
async def list_files(request: PathRequest):
    """
    Verilen yoldaki dosya ve dizinleri listeler.
    Her öğe için isim, tür (dosya/dizin) ve tam yol bilgisini döndürür.
    """
    try:
        if not os.path.exists(request.path):
             raise HTTPException(status_code=404, detail="Path not found")
        
        items = []
        with os.scandir(request.path) as entries:
            for entry in entries:
                # Gizli dosyaları/dizinleri atla (nokta ile başlayanlar)
                if entry.name.startswith('.'):
                    continue
                    
                items.append({
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "path": entry.path
                })
        
        # Önce dizinleri, sonra dosyaları sırala
        items.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/content")
async def get_file_content(request: PathRequest):
    """
    Belirli bir dosyanın içeriğini okur ve döndürür.
    Büyük dosyalar için boyut kontrolü yapar.
    """
    try:
        print(f"DEBUG: Requesting content for path: {request.path}")
        if not os.path.exists(request.path):
            raise HTTPException(status_code=404, detail="File not found")
        
        if not os.path.isfile(request.path):
             raise HTTPException(status_code=400, detail="Path is not a file")

        # Çok büyük dosyaların okunmasını engellemek için basit boyut kontrolü (Şimdilik 1MB sınır)
        if os.path.getsize(request.path) > 1024 * 1024: 
             raise HTTPException(status_code=400, detail="File too large to view")

        # Dosyayı UTF-8 olarak aç, okuma hatalarını 'replace' ile yönet
        with open(request.path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
            
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

