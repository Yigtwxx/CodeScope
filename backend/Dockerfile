FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/models

WORKDIR /app

# Build tools are needed by a few wheels; drop them again in the same layer.
COPY requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && pip install --upgrade pip \
    # The CPU wheel is ~200 MB against ~2.5 GB for the CUDA build. Containers
    # run on CPU here; use the native setup for GPU embeddings.
    && pip install --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install -r requirements.txt \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

# Bake the embedding model into the image so the first request does not stall
# on a silent 90 MB download.
RUN python -c "from sentence_transformers import SentenceTransformer; \
    SentenceTransformer('intfloat/multilingual-e5-base')"

COPY . .

RUN useradd --create-home --uid 10001 codescope \
    && mkdir -p /data/chroma \
    && chown -R codescope:codescope /app /data /opt/models
USER codescope

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
