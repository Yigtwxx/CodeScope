"""CodeScope API entry point."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints import router as api_router
from app.api.files import router as files_router
from app.api.schemas import HealthResponse
from app.core.config import settings
from app.core.device import resolve_device
from app.core.logging import configure_logging, get_logger
from app.db.chroma import count_documents, delete_persisted_data

configure_logging(settings.LOG_LEVEL)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Prepare shared resources on startup.

    The index is preserved across restarts by default; set
    ``RESET_DB_ON_STARTUP=true`` to get a clean database every launch.
    """
    logger.info("Starting %s v%s", settings.PROJECT_NAME, settings.VERSION)
    logger.info("Workspace root: %s", settings.WORKSPACE_ROOT)

    if settings.RESET_DB_ON_STARTUP:
        logger.info("RESET_DB_ON_STARTUP is enabled; clearing the vector store")
        delete_persisted_data()

    settings.CHROMA_DB_DIR.mkdir(parents=True, exist_ok=True)
    yield
    logger.info("Shutting down")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Local-first RAG assistant for exploring a codebase.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR, tags=["rag"])
app.include_router(files_router, prefix=f"{settings.API_V1_STR}/files", tags=["files"])


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check() -> HealthResponse:
    """Report service health plus how much of the codebase is indexed."""
    return HealthResponse(
        service=settings.PROJECT_NAME,
        version=settings.VERSION,
        indexed_chunks=count_documents(),
        embedding_device=resolve_device(),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_config=None,
    )
