"""Application configuration.

All values can be overridden through environment variables or a ``.env`` file
placed next to the ``backend`` directory. See ``.env.example`` for a reference.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ``backend/`` directory: app/core/config.py -> app/core -> app -> backend
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Typed, environment-driven application settings."""

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- Application metadata -------------------------------------------------
    PROJECT_NAME: str = "CodeScope"
    VERSION: str = "0.3.0"
    API_V1_STR: str = "/api"
    LOG_LEVEL: str = "INFO"

    # --- CORS -----------------------------------------------------------------
    # Comma-separated list of allowed browser origins. Defaults to the local
    # Next.js dev server; never widen this to "*" in a deployed setup.
    ALLOWED_ORIGINS: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    # --- Filesystem sandbox ---------------------------------------------------
    # Every path the API is asked to read must resolve inside this directory.
    # Defaults to the user's home directory, which keeps system files such as
    # /etc or C:\Windows out of reach while remaining convenient locally.
    WORKSPACE_ROOT: Path = Field(default_factory=Path.home)

    # Maximum size of a single file served through the file-content endpoint.
    MAX_FILE_SIZE_BYTES: int = 1024 * 1024

    # --- Vector store ---------------------------------------------------------
    CHROMA_DB_DIR: Path = BACKEND_DIR / "chroma_db"
    CHROMA_COLLECTION_NAME: str = "codescope_codebase"
    # Wipe the vector store when the server starts. Off by default so an
    # ingested repository survives a restart.
    RESET_DB_ON_STARTUP: bool = False

    # --- Embeddings -----------------------------------------------------------
    # Multilingual by default: code-specialised encoders score well on English
    # queries and collapse on everything else, and questions about a codebase
    # are not always asked in English. See docs/decisions.md for the numbers.
    EMBEDDING_MODEL_NAME: str = "intfloat/multilingual-e5-base"
    # "auto" resolves to cuda -> mps -> cpu. Override with an explicit device
    # name ("cuda", "mps", "cpu") when you need to pin it.
    EMBEDDING_DEVICE: str = "auto"
    # Instruction-tuned embedding models want a task prefix, and a different one
    # for a query than for a stored chunk. The e5 family requires these two;
    # blank them out when switching to a model that takes none.
    EMBEDDING_QUERY_PROMPT: str = "query: "
    EMBEDDING_DOCUMENT_PROMPT: str = "passage: "
    # Some models ship custom modelling code that only runs when this is on.
    # It executes code downloaded from the model repository, so it stays off
    # unless you have decided to trust that specific model.
    EMBEDDING_TRUST_REMOTE_CODE: bool = False

    # --- Ingestion ------------------------------------------------------------
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    # ChromaDB rejects very large single inserts; keep batches conservative.
    INGEST_BATCH_SIZE: int = 166
    MAX_INGEST_FILE_SIZE_BYTES: int = 2 * 1024 * 1024

    # --- Retrieval ------------------------------------------------------------
    RETRIEVAL_TOP_K: int = 8
    SEMANTIC_WEIGHT: float = 0.7
    BM25_WEIGHT: float = 0.3

    # --- Plain-text search ----------------------------------------------------
    SEARCH_MAX_RESULTS: int = 100
    SEARCH_MAX_FILES: int = 10_000
    SEARCH_MAX_FILE_SIZE_BYTES: int = 5 * 1024 * 1024

    # --- LLM ------------------------------------------------------------------
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    # A 9B model fits in 8 GB of VRAM alongside the embedding model and follows
    # the "answer in the question's language" instruction, which llama3 did not.
    OLLAMA_MODEL: str = "qwen3.5:9b"
    OLLAMA_TEMPERATURE: float = 0.1
    OLLAMA_TIMEOUT_SECONDS: int = 120
    # Ollama defaults to a 4096-token window regardless of what the model
    # supports. A grounded prompt can reach ~4000 tokens on its own, which left
    # no room to answer and truncated replies mid-sentence.
    OLLAMA_NUM_CTX: int = 8192
    # Bound the reply too, so an answer always finishes inside the window.
    OLLAMA_NUM_PREDICT: int = 1024
    # Hybrid reasoning models emit their chain of thought on a channel the chat
    # UI never renders, so leaving it on produces long pauses and blank answers.
    # Set to true to keep it (and to see it in the raw stream), null for the
    # model's own default.
    OLLAMA_REASONING: bool | None = False

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept ``a,b`` as well as a JSON list for ALLOWED_ORIGINS."""
        if isinstance(value, str) and not value.strip().startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("WORKSPACE_ROOT", "CHROMA_DB_DIR")
    @classmethod
    def _expand_path(cls, value: Path) -> Path:
        return Path(value).expanduser().resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()


settings = get_settings()
