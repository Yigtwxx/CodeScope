from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os

router = APIRouter()

class PathRequest(BaseModel):
    path: str

@router.post("/list")
async def list_files(request: PathRequest):
    """
    List files and directories in the given path.
    Returns a list of items with their name, type (file/dir), and full path.
    """
    try:
        if not os.path.exists(request.path):
             raise HTTPException(status_code=404, detail="Path not found")
        
        items = []
        with os.scandir(request.path) as entries:
            for entry in entries:
                # Skip hidden files/dirs effectively
                if entry.name.startswith('.'):
                    continue
                    
                items.append({
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "path": entry.path
                })
        
        # Sort directories first, then files
        items.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/content")
async def get_file_content(request: PathRequest):
    """
    Get the content of a specific file.
    """
    try:
        print(f"DEBUG: Requesting content for path: {request.path}")
        if not os.path.exists(request.path):
            raise HTTPException(status_code=404, detail="File not found")
        
        if not os.path.isfile(request.path):
             raise HTTPException(status_code=400, detail="Path is not a file")

        # Basic size check to prevent reading massive files
        if os.path.getsize(request.path) > 1024 * 1024: # 1MB limit for now
             raise HTTPException(status_code=400, detail="File too large to view")

        with open(request.path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
            
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
