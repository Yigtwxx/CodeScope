@echo off
echo Starting CodeScope...

:: Emoji destegi icin Python'u UTF-8'e zorla
set PYTHONIOENCODING=utf-8
:: Konsol kod sayfasini UTF-8 olarak ayarla
chcp 65001

:: Frontend klasorune git ve uygulamayi baslat
cd frontend
call npm run dev:all
