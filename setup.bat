@echo off
:: BayanSynth Studio — complete first-time setup
::
:: WHAT THIS DOES (in order):
::   1. Creates a Python virtual environment at <studio>\.venv
::   2. Installs all Python dependencies
::   3. Installs Node.js dependencies
::   4. Bundles cosyvoice + matcha + bayansynthtts into backend\lib\
::    (requires the BayanSynthTTS repo to be a sibling folder, OR
::     you can pass the path explicitly -- see usage below)
::   5. Downloads CosyVoice3 base model from Hugging Face  (~7 GB)
::   6. Downloads BayanSynthTTS LoRA checkpoint from GitHub Releases  (~1.9 GB)
::
:: USAGE:
::   setup.bat                                     (auto-detect sibling BayanSynthTTS repo)
::   setup.bat --skip-download                     (skip model downloads)
::   setup.bat "C:\BayanSynthTTS"                  (explicit path)
::
:: REQUIREMENTS: Python 3.10+, Node.js 18+, ~12 GB free disk space

setlocal EnableDelayedExpansion
set "STUDIO=%~dp0"
set "COSYVOICE_REPO="
set "BAYAN_REPO="
set "SKIP_DOWNLOAD=0"
set "AUTO_CONFIRM=0"

:: Parse args in any order:
::   --skip-download, --yes/--run, <cosyvoice_repo>, <bayansynth_repo>
:parse_args
if "%~1"=="" goto :after_args
if /i "%~1"=="--skip-download" (
    set "SKIP_DOWNLOAD=1"
    shift
    goto :parse_args
)
if /i "%~1"=="--yes" (
    set "AUTO_CONFIRM=1"
    shift
    goto :parse_args
)
if /i "%~1"=="--run" (
    set "AUTO_CONFIRM=1"
    shift
    goto :parse_args
)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage

:: Common accidental launcher arg when clicking file links in chat/tools.
if /i "%~1"=="#file:setup.bat" (
    echo [Setup] Detected accidental launcher argument: %~1
    echo [Setup] No changes were made.
    goto :usage
)

if not defined COSYVOICE_REPO (
    set "COSYVOICE_REPO=%~1"
    shift
    goto :parse_args
)
if not defined BAYAN_REPO (
    set "BAYAN_REPO=%~1"
    shift
    goto :parse_args
)

echo [Setup] ERROR: Unexpected extra argument: %~1
echo.
goto :usage_error

:after_args

if "%AUTO_CONFIRM%" NEQ "1" (
    echo.
    echo [Setup] Safety lock: setup does NOT run on plain click anymore.
    echo [Setup] No changes were made.
    echo.
    echo [Setup] Run intentionally with:
    echo         setup.bat --yes [--skip-download] [COSYVOICE_REPO] [BAYAN_REPO]
    echo.
    exit /b 0
)

echo.
echo +==============================================+
echo ^|          BayanSynth Studio - Setup          ^|
echo +==============================================+
echo.

if not exist "%STUDIO%backend\requirements.txt" (
    echo [Setup] ERROR: Missing backend\requirements.txt
    echo         Run this from demos\studio\setup.bat inside the repo.
    pause & exit /b 1
)
if not exist "%STUDIO%bundle_deps.bat" (
    echo [Setup] ERROR: Missing bundle_deps.bat in %STUDIO%
    pause & exit /b 1
)
if not exist "%STUDIO%backend\download_models.py" (
    echo [Setup] ERROR: Missing backend\download_models.py
    pause & exit /b 1
)

echo [Setup] Auto-confirm enabled via --yes.

:: -- Check Python --
python --version > nul 2>&1
if errorlevel 1 (
    echo [Setup] ERROR: Python not found.
    echo         Install Python 3.10+ from https://python.org -- tick "Add to PATH".
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo [Setup] Found %%v

:: -- Check Node.js --
set "PATH=%PATH%;C:\Program Files\nodejs"
node --version > nul 2>&1
if errorlevel 1 (
    echo [Setup] ERROR: Node.js not found.
    echo         Install Node.js 18+ from https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo [Setup] Found Node.js %%v

echo.
echo [Step 1/5] Creating Python virtual environment...
if exist "%STUDIO%.venv\Scripts\python.exe" (
    echo [Setup] venv already exists -- skipping creation.
) else (
    python -m venv "%STUDIO%.venv"
    if errorlevel 1 ( echo [Setup] ERROR: venv creation failed. & pause & exit /b 1 )
    echo [Setup] venv created at %STUDIO%.venv
)

echo.
echo [Step 2/5] Installing Python dependencies...
echo            (torch alone takes a few minutes on first install)
call "%STUDIO%.venv\Scripts\activate.bat"
pip install --upgrade pip --quiet
pip install -r "%STUDIO%backend\requirements.txt"
if errorlevel 1 ( echo [Setup] ERROR: pip install failed. & pause & exit /b 1 )

echo.
echo [Step 3/5] Installing Node.js dependencies...
cd /d "%STUDIO%"
npm install
if errorlevel 1 ( echo [Setup] ERROR: npm install failed. & pause & exit /b 1 )

echo.
echo [Step 4/5] Bundling Python packages into backend\lib\ ...
call "%STUDIO%bundle_deps.bat" "!COSYVOICE_REPO!" "!BAYAN_REPO!"
if errorlevel 1 ( echo [Setup] bundle_deps.bat failed. & pause & exit /b 1 )

echo.
echo [Step 5/5] Downloading model weights...
if "!SKIP_DOWNLOAD!"=="1" (
    echo [Setup] Skipped (--skip-download^). Run later:
    echo           python backend\download_models.py
) else (
    python "%STUDIO%backend\download_models.py"
    if errorlevel 1 ( echo [Setup] Model download failed. See above for details. )
)

echo.
echo +==============================================+
echo ^|  Setup complete!                            ^|
echo ^|                                             ^|
echo ^|  Launch:  double-click start_studio.bat     ^|
echo +==============================================+
echo.
pause

:usage
echo Usage:
echo   setup.bat [--skip-download] [--yes] [COSYVOICE_REPO] [BAYAN_REPO]
echo.
echo Examples:
echo   setup.bat
echo   setup.bat --skip-download
echo   setup.bat --yes
echo   setup.bat "C:\CosyVoice" "C:\BayanSynthTTS"
exit /b 0

:usage_error
echo Usage:
echo   setup.bat [--skip-download] [--yes] [COSYVOICE_REPO] [BAYAN_REPO]
pause
exit /b 1