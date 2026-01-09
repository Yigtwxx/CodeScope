@echo off
echo Starting CodeScope...

:: Force UTF-8 for Python to handle emojis
set PYTHONIOENCODING=utf-8
:: Set console code page to UTF-8
chcp 65001

cd frontend
call npm run dev:all
