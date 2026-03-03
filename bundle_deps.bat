@echo off
:: BayanSynth Studio — bundle all Python dependencies inside this studio folder
::
:: Copies the following into  backend\lib\:
::   cosyvoice\          — CosyVoice3 Python package
::   matcha\             — Matcha-TTS Python package
::   BayanSynthTTS\      — BayanSynthTTS library  (code + voices, NOT model weights)
::
:: Model weights (~9 GB) are NOT bundled — run  setup.bat  or
::   python backend\download_models.py  to download them after bundling.
::
:: Usage:
::   bundle_deps.bat                       auto-detect from sibling-repo layout
::   bundle_deps.bat "C:\path\to\CosyVoice-Arabic"  "C:\path\to\BayanSynthTTS"

setlocal EnableDelayedExpansion
set "STUDIO=%~dp0"
set "LIB=%STUDIO%backend\lib"

:: ── Locate source repositories ─────────────────────────────────────────────
set "REPO=%~1"
set "BAYAN_SRC=%~2"

if not defined REPO (
    :: Walk up looking for the CosyVoice-Arabic repo root
    for %%D in ("%STUDIO%..")       do set "_P1=%%~fD"
    for %%D in ("%STUDIO%..\..") do set "_P2=%%~fD"
    for %%D in ("%STUDIO%..\..\..") do set "_P3=%%~fD"

    if exist "!_P1!\cosyvoice\__init__.py"  set "REPO=!_P1!"
    if not defined REPO if exist "!_P2!\cosyvoice\__init__.py" set "REPO=!_P2!"
    if not defined REPO if exist "!_P3!\cosyvoice\__init__.py" set "REPO=!_P3!"
)

if not defined BAYAN_SRC (
    if exist "!REPO!\BayanSynthTTS\bayansynthtts\__init__.py" (
        set "BAYAN_SRC=!REPO!\BayanSynthTTS"
    ) else (
        for %%D in ("!REPO!\..")    do set "_PB1=%%~fD"
        if exist "!_PB1!\BayanSynthTTS\bayansynthtts\__init__.py" set "BAYAN_SRC=!_PB1!\BayanSynthTTS"
    )
)

if not defined REPO (
    echo [Bundle] ERROR: Cannot find the CosyVoice-Arabic repo.
    echo          Pass paths explicitly:
    echo            bundle_deps.bat "C:\CosyVoice-Arabic" "C:\BayanSynthTTS"
    pause & exit /b 1
)
if not defined BAYAN_SRC (
    echo [Bundle] ERROR: Cannot find BayanSynthTTS.
    echo          Pass paths explicitly:
    echo            bundle_deps.bat "C:\CosyVoice-Arabic" "C:\BayanSynthTTS"
    pause & exit /b 1
)

echo [Bundle] CosyVoice repo  : %REPO%
echo [Bundle] BayanSynthTTS   : %BAYAN_SRC%
echo [Bundle] Destination     : %LIB%
echo.

:: ── 1. cosyvoice package ────────────────────────────────────────────────────
echo [Bundle] Copying cosyvoice/ ...
if not exist "%REPO%\cosyvoice\__init__.py" (
    echo [Bundle] ERROR: cosyvoice package not found at %REPO%\cosyvoice\
    pause & exit /b 1
)
xcopy /E /I /Y /Q "%REPO%\cosyvoice" "%LIB%\cosyvoice\"
if errorlevel 1 ( echo [Bundle] ERROR during cosyvoice copy. & pause & exit /b 1 )

:: ── 2. matcha package ───────────────────────────────────────────────────────
echo [Bundle] Copying matcha/ ...
set "MATCHA_SRC="
if exist "%REPO%\matcha\__init__.py"                                  set "MATCHA_SRC=%REPO%\matcha"
if not defined MATCHA_SRC if exist "%REPO%\third_party\Matcha-TTS\matcha\__init__.py" set "MATCHA_SRC=%REPO%\third_party\Matcha-TTS\matcha"
if not defined MATCHA_SRC (
    echo [Bundle] WARNING: matcha package not found at %REPO%\matcha\ — skipping.
    echo          matcha-tts may be installed as a pip package instead, which is fine.
) else (
    xcopy /E /I /Y /Q "%MATCHA_SRC%" "%LIB%\matcha\"
    if errorlevel 1 ( echo [Bundle] ERROR during matcha copy. & pause & exit /b 1 )
)

:: ── 3. BayanSynthTTS Python package ─────────────────────────────────────────
echo [Bundle] Copying BayanSynthTTS Python package (no model weights) ...
set "DEST_BAYAN=%LIB%\BayanSynthTTS"

xcopy /E /I /Y /Q "%BAYAN_SRC%\bayansynthtts"  "%DEST_BAYAN%\bayansynthtts\"
if errorlevel 1 ( echo [Bundle] ERROR. & pause & exit /b 1 )

if exist "%BAYAN_SRC%\conf"   xcopy /E /I /Y /Q "%BAYAN_SRC%\conf"   "%DEST_BAYAN%\conf\"
if exist "%BAYAN_SRC%\voices" xcopy /E /I /Y /Q "%BAYAN_SRC%\voices" "%DEST_BAYAN%\voices\"
if exist "%BAYAN_SRC%\asset"  xcopy /E /I /Y /Q "%BAYAN_SRC%\asset"  "%DEST_BAYAN%\asset\"

:: Copy metadata files
if exist "%BAYAN_SRC%\pyproject.toml"   copy /Y "%BAYAN_SRC%\pyproject.toml"   "%DEST_BAYAN%\pyproject.toml"   > nul
if exist "%BAYAN_SRC%\requirements.txt" copy /Y "%BAYAN_SRC%\requirements.txt" "%DEST_BAYAN%\requirements.txt" > nul

:: Create stub pretrained_models and checkpoints dirs (filled by download_models.py)
mkdir "%DEST_BAYAN%\pretrained_models\CosyVoice3" 2>nul
mkdir "%DEST_BAYAN%\checkpoints\llm"             2>nul

echo.
echo [Bundle] Done!
echo.
echo [Bundle] Python code is bundled. Model weights still need to be downloaded.
echo [Bundle] Run next:
echo           python backend\download_models.py
echo.
echo [Bundle] Or run setup.bat which does everything in one go.
pause
