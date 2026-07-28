@echo off
setlocal

:: Start the CodeScope backend and frontend together on Windows.

:: Force UTF-8 so log output renders correctly in cmd.exe.
chcp 65001 >nul
set PYTHONIOENCODING=utf-8

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Python virtual environment not found at .venv
  echo Run this once first:
  echo   python -m venv .venv
  echo   .venv\Scripts\activate
  echo   pip install -r backend\requirements.txt
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo [ERROR] Frontend dependencies not installed.
  echo Run this once first:
  echo   cd frontend ^&^& npm install
  exit /b 1
)

echo Starting CodeScope...
echo   Backend  http://localhost:8000
echo   Frontend http://localhost:3000
echo.

:: dev:all launches uvicorn as plain "python" so the script stays portable;
:: activating the environment first is what makes that resolve to .venv.
call ".venv\Scripts\activate.bat"

cd frontend
call npm run dev:all
