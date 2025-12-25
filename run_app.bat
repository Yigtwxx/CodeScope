@echo off
echo Starting CodeScope...

:: Start Backend
start "CodeScope Backend" cmd /k "call .venv\Scripts\activate && cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Start Frontend
start "CodeScope Frontend" cmd /k "cd frontend && npm run dev"

:: Open Browser
echo Waiting for servers to start...
timeout /t 5
start http://localhost:3000

echo Done! Backend running on port 8000, Frontend on port 3000.
