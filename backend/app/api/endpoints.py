from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services.ingestion import ingest_repository
from app.services.rag import chat_stream

router = APIRouter()

class IngestRequest(BaseModel):
    repo_path: str

class ChatRequest(BaseModel):
    message: str

@router.post("/ingest")
async def ingest_endpoint(request: IngestRequest, background_tasks: BackgroundTasks):
    try:
        print(f"Received ingestion request for path: {request.repo_path}")
        # Validate path existence quickly before returning
        import os
        if not os.path.exists(request.repo_path):
             raise HTTPException(status_code=404, detail="Path not found")

        # Run ingestion in background
        background_tasks.add_task(ingest_repository, request.repo_path)
        
        print(f"Background ingestion started for: {request.repo_path}")
        return {"message": "Repository opened. Ingestion started in background.", "status": "processing"}
    except Exception as e:
        print(f"Ingestion setup failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    return StreamingResponse(chat_stream(request.message), media_type="text/event-stream")
