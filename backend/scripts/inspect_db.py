"""Developer utility: inspect the local ChromaDB collection.

Usage:
    python -m scripts.inspect_db          # summary + 3 sample chunks
    python -m scripts.inspect_db --limit 10
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running the file directly from the backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import chromadb  # noqa: E402

from app.core.config import settings  # noqa: E402


def inspect(limit: int) -> int:
    """Print a summary of every collection in the local store."""
    db_dir = settings.CHROMA_DB_DIR
    print("CodeScope ChromaDB inspector")
    print(f"Database path: {db_dir}\n")

    if not db_dir.exists():
        print("No database directory found. Ingest a repository first.")
        return 1

    try:
        client = chromadb.PersistentClient(path=str(db_dir))
        collections = client.list_collections()
    except Exception as exc:
        print(f"Could not open the database: {exc}")
        return 1

    if not collections:
        print("No collections found.")
        return 0

    print(f"Collections: {len(collections)}")

    for collection in collections:
        count = collection.count()
        print(f"\n  {collection.name}: {count} chunks")
        if count == 0:
            continue

        data = collection.peek(limit=min(limit, count))
        for index, (doc_id, metadata, document) in enumerate(
            zip(data["ids"], data["metadatas"], data["documents"], strict=False), 1
        ):
            preview = (document or "")[:200].replace("\n", " ")
            print(f"\n    [{index}] id={doc_id}")
            print(f"        path     : {(metadata or {}).get('relative_path', '?')}")
            print(f"        language : {(metadata or {}).get('language', '?')}")
            print(f"        symbols  : {(metadata or {}).get('symbols', '-')}")
            print(f"        preview  : {preview}...")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit", type=int, default=3, help="How many sample chunks to show"
    )
    args = parser.parse_args()
    return inspect(args.limit)


if __name__ == "__main__":
    raise SystemExit(main())
