@echo off
setlocal EnableDelayedExpansion

:: BayanSynth Studio release builder
::
:: Produces portable artifacts for release uploads:
::   - GPU Windows package: BayanSynth-Studio-<ver>-win-x64.7z
::   - CPU Windows package: BayanSynth-Studio-<ver>-win-x64-cpu.7z
::   - Linux artifacts (AppImage + tar.gz) via electron-builder
::
:: Usage:
::   build_release.bat --gpu
::   build_release.bat --cpu
::   build_release.bat --all
::   build_release.bat --linux
::   build_release.bat --all --linux

set "STUDIO=%~dp0"
set "MODE=gpu"
set "BUILD_LINUX=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--gpu" set "MODE=gpu"
if /I "%~1"=="--cpu" set "MODE=cpu"
if /I "%~1"=="--all" set "MODE=all"
if /I "%~1"=="--linux" set "BUILD_LINUX=1"
shift
goto parse_args

:args_done

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content '%STUDIO%package.json' -Raw | ConvertFrom-Json).version"`) do set "VERSION=%%V"
if "%VERSION%"=="" set "VERSION=dev"

echo.
echo +============================================================+
echo ^| BayanSynth Studio release build                           ^|
echo ^| Version: %VERSION%                                        ^|
echo ^| Mode   : %MODE%                                           ^|
echo ^| Linux  : %BUILD_LINUX%                                    ^|
echo +============================================================+
echo.

call :ensure_tools || exit /b 1
call :build_frontend || exit /b 1

if /I "%MODE%"=="gpu" (
  call :build_windows gpu || exit /b 1
) else if /I "%MODE%"=="cpu" (
  call :build_windows cpu || exit /b 1
) else (
  call :build_windows gpu || exit /b 1
  call :build_windows cpu || exit /b 1
)

if "%BUILD_LINUX%"=="1" (
  call :build_linux || exit /b 1
)

echo.
echo [Release] Done. Upload artifacts from dist\ to GitHub Releases.
echo.
exit /b 0

:ensure_tools
echo [Release] Checking tools...
where npm >nul 2>nul || (echo [Release] ERROR: npm not found in PATH.& exit /b 1)
where npx >nul 2>nul || (echo [Release] ERROR: npx not found in PATH.& exit /b 1)
exit /b 0

:build_frontend
echo [Release] Building frontend...
call npm run build:frontend
if errorlevel 1 (
  echo [Release] ERROR: frontend build failed.
  exit /b 1
)
exit /b 0

:build_windows
set "FLAVOR=%~1"
set "SUFFIX="
set "BUNDLE_ARG="
if /I "%FLAVOR%"=="cpu" (
  set "SUFFIX=-cpu"
  set "BUNDLE_ARG=--cpu"
)

echo.
echo [Release] Preparing Windows %FLAVOR% package...
call "%STUDIO%bundle_deps.bat"
if errorlevel 1 exit /b 1

call "%STUDIO%bundle_python.bat" %BUNDLE_ARG%
if errorlevel 1 exit /b 1

echo [Release] Building Electron portable app (%FLAVOR%)...
call npx electron-builder --win portable --x64
if errorlevel 1 (
  echo [Release] ERROR: electron-builder failed for %FLAVOR%.
  exit /b 1
)

set "PACK_SRC=%STUDIO%dist\win-unpacked\*"
set "PACK_OUT=%STUDIO%dist\BayanSynth-Studio-%VERSION%-win-x64%SUFFIX%.7z"

if exist "%PACK_OUT%" del "%PACK_OUT%" >nul 2>nul

if exist "%ProgramFiles%\7-Zip\7z.exe" (
  echo [Release] Creating archive %PACK_OUT%
  "%ProgramFiles%\7-Zip\7z.exe" a -t7z -mx=5 "%PACK_OUT%" "%PACK_SRC%" >nul
  if errorlevel 1 (
    echo [Release] ERROR: 7z archive failed.
    exit /b 1
  )
) else (
  echo [Release] WARNING: 7-Zip not found. Skipping .7z creation for %FLAVOR%.
)

exit /b 0

:build_linux
echo.
echo [Release] Building Linux artifacts (AppImage + tar.gz)...
call npx electron-builder --linux AppImage tar.gz
if errorlevel 1 (
  echo [Release] ERROR: Linux build failed.
  exit /b 1
)
exit /b 0
