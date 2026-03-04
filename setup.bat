@echo off
:: BayanSynth Studio — complete first-time setup
::
:: WHAT THIS DOES (in order):
::   1. Creates a Python virtual environment at <studio>\.venv
::   2. Installs all Python dependencies
::   3. Installs Node.js dependencies
::   4. Bundles cosyvoice + matcha + bayansynthtts into backend\lib\
::      (requires the CosyVoice-Arabic repo to be a sibling folder, OR
::       you can pass paths explicitly — see usage below)
::   5. Downloads CosyVoice3 base model from Hugging Face  (~7 GB)
::   6. Downloads BayanSynthTTS LoRA checkpoint from GitHub Releases  (~1.9 GB)
::
:: USAGE:
::   setup.bat                                     (auto-detect sibling repos)
::   setup.bat --skip-download                     (skip model downloads)
::   setup.bat "C:\CosyVoice-Arabic" "C:\BayanSynthTTS"  (explicit paths)
::
:: REQUIREMENTS: Python 3.10+, Node.js 18+, ~12 GB free disk space

setlocal EnableDelayedExpansion
set "STUDIO=%~dp0"
set "COSYVOICE_REPO=%~1"
set "BAYAN_REPO=%~2"
set "SKIP_DOWNLOAD=0"

:: Check for --skip-download flag
if "%~1"=="--skip-download" (
    set "SKIP_DOWNLOAD=1"
    set "COSYVOICE_REPO="
    set "BAYAN_REPO="
)
if "%~2"=="--skip-download" set "SKIP_DOWNLOAD=1"

echo.
echo +==============================================+
echo ^|          BayanSynth Studio - Setup          ^|
echo +==============================================+
echo.

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