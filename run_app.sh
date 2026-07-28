#!/usr/bin/env bash
# Start the CodeScope backend and frontend together on macOS or Linux.
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "[ERROR] Python virtual environment not found at .venv" >&2
  echo "Run this once first:" >&2
  echo "  python3 -m venv .venv" >&2
  echo "  source .venv/bin/activate" >&2
  echo "  pip install -r backend/requirements.txt" >&2
  exit 1
fi

if [[ ! -d "frontend/node_modules" ]]; then
  echo "[ERROR] Frontend dependencies not installed." >&2
  echo "Run this once first: cd frontend && npm install" >&2
  exit 1
fi

echo "Starting CodeScope..."
echo "  Backend  http://localhost:8000"
echo "  Frontend http://localhost:3000"

# Stop the backend when this script exits for any reason.
cleanup() { [[ -n "${backend_pid:-}" ]] && kill "$backend_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(
  cd backend
  exec ../.venv/bin/python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
) &
backend_pid=$!

cd frontend
npm run dev
