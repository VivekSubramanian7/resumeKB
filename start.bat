@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where uv >nul 2>&1
if errorlevel 1 (
    echo [ERROR] uv is not on PATH. Install from https://docs.astral.sh/uv/
    pause
    exit /b 1
)

if not exist ".env" (
    echo [WARN] No .env file found — using built-in defaults.
    echo        Copy and edit .env for KB_EXTRACTOR, WHISPER_MODEL, PORT, etc.
    echo.
)

echo Syncing dependencies...
uv sync --quiet
if errorlevel 1 (
    echo [ERROR] uv sync failed.
    pause
    exit /b 1
)

set "PORT=8137"
set "EXTRACTOR=openai"
if exist ".env" (
    for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
        if /i "%%a"=="PORT" if not "%%b"=="" set "PORT=%%b"
        if /i "%%a"=="KB_EXTRACTOR" if not "%%b"=="" set "EXTRACTOR=%%b"
    )
)

echo.
echo  resumeKB — user testing
echo  ---------------------
echo  Open:     http://127.0.0.1:%PORT%
echo  Extract:  %EXTRACTOR%  (fake = canned demo data; openai = real extraction from transcript)
echo  Whisper:  see WHISPER_MODEL in .env (downloads on first recording)
echo  KB data:  ./kb-data/{user_id}  (per-user; legacy ./kb is archive only)
echo  Auth:     set SUPABASE_URL + SUPABASE_ANON_KEY in .env, or AUTH_DISABLED=true for tests
echo.
echo  Press Ctrl+C to stop the server.
echo.

start "" "http://127.0.0.1:%PORT%"

uv run uvicorn --factory resume_kb_server.app:create_app --host 127.0.0.1 --port %PORT%

endlocal
