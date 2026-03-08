@echo off
:: BayanSynth Studio — bundle an embedded Python environment for distribution
::
:: Downloads the Python 3.11 embeddable zip from python.org, installs pip,
:: then installs all backend dependencies into it.  The result lives at:
::
::     backend\python_embed\           (~2-4 GB with torch + deps)
::
:: electron-builder includes this folder as an extraResource so the packaged
:: .exe ships with a fully self-contained Python — no system Python needed.
::
:: NOTE: This script uses YOUR existing .venv Python to bootstrap pip into
:: the embeddable distribution.  Run setup.bat first if you haven't yet.
::
:: Usage:
::   bundle_python.bat                     <- default (GPU / CUDA build of torch)
::   bundle_python.bat --cpu               <- CPU-only torch (smaller, no GPU)

setlocal EnableDelayedExpansion
set "STUDIO=%~dp0"
set "EMBED_DIR=%STUDIO%backend\python_embed"
set "PY_VERSION=3.11.9"
set "PY_ZIP=python-%PY_VERSION%-embed-amd64.zip"
set "PY_URL=https://www.python.org/ftp/python/%PY_VERSION%/%PY_ZIP%"
set "GET_PIP_URL=https://bootstrap.pypa.io/get-pip.py"
set "CPU_ONLY=0"

if "%~1"=="--cpu" set "CPU_ONLY=1"

echo.
echo +==============================================+
echo ^|   BayanSynth Studio - Bundle Python         ^|
echo +==============================================+
echo.

:: ── Step 0: Check prerequisites ─────────────────────────────────────────────
echo [Bundle] Checking prerequisites...
if not exist "%STUDIO%.venv\Scripts\python.exe" (
    if not exist "%STUDIO%..\..\..\.venv\Scripts\python.exe" (
        echo [Bundle] ERROR: No .venv found. Run setup.bat first.
        pause & exit /b 1
    )
)

:: ── Step 1: Download embeddable Python ──────────────────────────────────────
echo.
echo [Step 1/5] Downloading Python %PY_VERSION% embeddable...
if exist "%EMBED_DIR%\python.exe" (
    echo [Bundle] python_embed already exists — reusing. Delete it to start fresh.
    goto :install_pip
)

mkdir "%EMBED_DIR%" 2>nul

:: Download the zip
set "ZIP_PATH=%STUDIO%backend\%PY_ZIP%"
if not exist "%ZIP_PATH%" (
    echo [Bundle] Downloading %PY_URL%
    powershell -NoProfile -Command "Invoke-WebRequest -Uri '%PY_URL%' -OutFile '%ZIP_PATH%' -UseBasicParsing"
    if errorlevel 1 (
        echo [Bundle] ERROR: Download failed.
        pause & exit /b 1
    )
)

:: Extract
echo [Bundle] Extracting to %EMBED_DIR%
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%EMBED_DIR%' -Force"
if errorlevel 1 (
    echo [Bundle] ERROR: Extraction failed.
    pause & exit /b 1
)

:: Clean up zip
del "%ZIP_PATH%" 2>nul

:: ── Step 2: Enable pip in embeddable Python ─────────────────────────────────
:install_pip
echo.
echo [Step 2/5] Enabling pip...

:: The embeddable distribution ships with python311._pth which blocks pip.
:: We need to uncomment "import site" in it.
set "PTH_FILE=%EMBED_DIR%\python311._pth"
if exist "%PTH_FILE%" (
    echo [Bundle] Patching %PTH_FILE% to enable site-packages...
    powershell -NoProfile -Command "(Get-Content '%PTH_FILE%') -replace '^#import site', 'import site' | Set-Content '%PTH_FILE%'"
)

:: Download and run get-pip.py
set "GET_PIP=%EMBED_DIR%\get-pip.py"
if not exist "%GET_PIP%" (
    echo [Bundle] Downloading get-pip.py...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri '%GET_PIP_URL%' -OutFile '%GET_PIP%' -UseBasicParsing"
)
if not exist "%EMBED_DIR%\Scripts\pip.exe" (
    echo [Bundle] Installing pip...
    "%EMBED_DIR%\python.exe" "%GET_PIP%" --no-warn-script-location
    if errorlevel 1 (
        echo [Bundle] ERROR: pip installation failed.
        pause & exit /b 1
    )
)
del "%GET_PIP%" 2>nul

echo [Bundle] pip installed OK.

:: ── Step 3: Install PyTorch ─────────────────────────────────────────────────
echo.
echo [Step 3/5] Installing PyTorch...

if "%CPU_ONLY%"=="1" (
    echo [Bundle] CPU-only build selected.
    "%EMBED_DIR%\python.exe" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --no-warn-script-location
) else (
    echo [Bundle] CUDA (GPU) build — this downloads ~2.5 GB.
    "%EMBED_DIR%\python.exe" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121 --no-warn-script-location
)
if errorlevel 1 (
    echo [Bundle] ERROR: PyTorch installation failed.
    pause & exit /b 1
)

:: ── Step 4: Install remaining dependencies ──────────────────────────────────
echo.
echo [Step 4/5] Installing remaining Python packages...
"%EMBED_DIR%\python.exe" -m pip install -r "%STUDIO%backend\requirements.txt" --no-warn-script-location
if errorlevel 1 (
    echo [Bundle] ERROR: pip install failed.
    pause & exit /b 1
)

:: ── Step 5: Verify ──────────────────────────────────────────────────────────
echo.
echo [Step 5/5] Verifying installation...
"%EMBED_DIR%\python.exe" -c "import fastapi; import torch; import librosa; print('All imports OK')"
if errorlevel 1 (
    echo [Bundle] WARNING: Some imports failed. Check the errors above.
) else (
    echo [Bundle] All imports verified!
)

:: ── Report size ─────────────────────────────────────────────────────────────
echo.
for /f "tokens=*" %%S in ('powershell -NoProfile -Command "(Get-ChildItem -Recurse '%EMBED_DIR%' | Measure-Object -Property Length -Sum).Sum / 1GB | ForEach-Object { '{0:N2} GB' -f $_ }"') do set "TOTAL_SIZE=%%S"
echo [Bundle] python_embed total size: %TOTAL_SIZE%
echo.
echo +==============================================+
echo ^|  Python bundled successfully!               ^|
echo ^|                                             ^|
echo ^|  Now run:  npm run build                    ^|
echo ^|  The exe will include Python + all deps.    ^|
echo +==============================================+
echo.
pause
