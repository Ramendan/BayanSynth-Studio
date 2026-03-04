@echo off
:: BayanSynth Studio — portable launcher
:: Can be run from Explorer or any working directory.
:: Searches for a Python venv in this order:
::   1. <studio>\.venv          (created by setup.bat — fully self-contained)
::   2. <repo-root>\.venv       (default in-repo layout fallback)

setlocal EnableDelayedExpansion
set "STUDIO=%~dp0"

:: ── Locate Python venv ───────────────────────────────────────────────────────
set "VENV="
if exist "%STUDIO%.venv\Scripts\activate.bat" (
    set "VENV=%STUDIO%.venv"
    echo [Studio] Using studio-local venv.
) else (
    :: Walk up looking for a repo-level .venv (handles the in-repo checkout case)
    for %%D in ("%STUDIO%..") do set "_PARENT=%%~fD"
    for %%D in ("%STUDIO%..\..") do set "_GRANDPARENT=%%~fD"
    if exist "!_PARENT!\.venv\Scripts\activate.bat" (
        set "VENV=!_PARENT!\.venv"
    ) else if exist "!_GRANDPARENT!\.venv\Scripts\activate.bat" (
        set "VENV=!_GRANDPARENT!\.venv"
    )
    if defined VENV (
        echo [Studio] Using repo-level venv: !VENV!
    ) else (
        echo [Studio] ERROR: No Python venv found.
        echo [Studio] Run  "%STUDIO%setup.bat"  to create one, then try again.
        pause
        exit /b 1
    )
)

:: ── Clean up leftover processes ──────────────────────────────────────────────
taskkill /F /IM electron.exe /T > nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5177 ^| findstr LISTENING') do taskkill /F /PID %%a > nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5178 ^| findstr LISTENING') do taskkill /F /PID %%a > nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8910 ^| findstr LISTENING') do taskkill /F /PID %%a > nul 2>&1

:: ── Ensure Node.js is in PATH ────────────────────────────────────────────────
set "PATH=%PATH%;C:\Program Files\nodejs"

:: ── Launch ───────────────────────────────────────────────────────────────────
call "!VENV!\Scripts\activate.bat"
cd /d "%STUDIO%"
npm run dev
