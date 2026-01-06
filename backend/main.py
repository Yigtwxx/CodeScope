from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import router as api_router

app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Startup Cleanup: Clear existing vector DB to ensure fresh start
import shutil
import os
import sys

# Ensure UTF-8 output for emojis on Windows
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')


@app.on_event("startup")
async def startup_event():
    print("🧹 [Startup] Checking for existing ChromaDB persistence to clear...")
    db_path = settings.CHROMA_DB_DIR
    if os.path.exists(db_path):
        try:
            # Check if it's a file or directory and delete accordingly
            if os.path.isdir(db_path):
                shutil.rmtree(db_path)
            else:
                os.remove(db_path)
            print(f"✅ [Startup] Cleared existing persistence at {db_path}")
        except Exception as e:
            print(f"⚠️  [Startup] Warning - Failed to clear persistence: {e}")
    else:
        print("✨ [Startup] No existing persistence found. Starting fresh.")

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development, allow all. In production, specify frontend URL.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.files import router as files_router

app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(files_router, prefix="/api/files", tags=["files"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    
# A
