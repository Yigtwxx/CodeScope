from fastapi import APIRouter, HTTPException
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
async def ingest_endpoint(request: IngestRequest):
    try:
        print(f"Received ingestion request for path: {request.repo_path}")
        result = ingest_repository(request.repo_path)
        print(f"Ingestion successful: {result}")
        return result
    except Exception as e:
        print(f"Ingestion failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    return StreamingResponse(chat_stream(request.message), media_type="text/event-stream")
