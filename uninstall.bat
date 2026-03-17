@echo off
setlocal EnableDelayedExpansion

:: BayanSynth Studio uninstaller helper
::
:: Removes selected data categories from:
::   %APPDATA%\bayansynth-studio\
:: and optionally local project voices folder.

set "APPDATA_ROOT=%APPDATA%\bayansynth-studio"
set "MODELS_DIR=%APPDATA_ROOT%\pretrained_models"
set "CHECKPOINTS_DIR=%APPDATA_ROOT%\checkpoints"
set "PROJECTS_DIR=%APPDATA_ROOT%\projects"
set "SETTINGS_DIR=%APPDATA_ROOT%"
set "LOCAL_VOICES=%~dp0voices"

echo.
echo +================================================+
echo ^| BayanSynth Studio - Uninstaller               ^|
echo +================================================+
echo Data root : %APPDATA_ROOT%
echo Voices dir: %LOCAL_VOICES%
echo.
echo Choose what to remove:
echo   1. AI models ^(pretrained_models + checkpoints^)
echo   2. Project files ^(AppData projects folder^)
echo   3. Settings/preferences
echo   4. Custom voices ^(local voices folder^)
echo   5. Remove all of the above
echo.
set /p CHOICE=Enter option [1-5]: 

if "%CHOICE%"=="1" goto do_models
if "%CHOICE%"=="2" goto do_projects
if "%CHOICE%"=="3" goto do_settings
if "%CHOICE%"=="4" goto do_voices
if "%CHOICE%"=="5" goto do_all

echo Invalid choice.
exit /b 1

:confirm
set "TARGET_DESC=%~1"
set /p OK=Confirm removal of %TARGET_DESC% ? [y/N]: 
if /I not "%OK%"=="y" (
  echo Cancelled.
  exit /b 0
)
exit /b 0

:remove_dir
set "DIR=%~1"
if exist "%DIR%" (
  echo [Uninstall] Removing %DIR%
  rmdir /s /q "%DIR%"
) else (
  echo [Uninstall] Not found: %DIR%
)
exit /b 0

:do_models
call :confirm "AI models"
call :remove_dir "%MODELS_DIR%"
call :remove_dir "%CHECKPOINTS_DIR%"
goto done

:do_projects
call :confirm "project files"
call :remove_dir "%PROJECTS_DIR%"
goto done

:do_settings
call :confirm "settings/preferences"
if exist "%APPDATA_ROOT%\settings.json" del /q "%APPDATA_ROOT%\settings.json"
if exist "%APPDATA_ROOT%\state.json" del /q "%APPDATA_ROOT%\state.json"
if exist "%APPDATA_ROOT%\preferences.json" del /q "%APPDATA_ROOT%\preferences.json"
if exist "%APPDATA_ROOT%\logs" call :remove_dir "%APPDATA_ROOT%\logs"
goto done

:do_voices
call :confirm "custom voices"
call :remove_dir "%LOCAL_VOICES%"
goto done

:do_all
call :confirm "all app data, settings, models, and voices"
call :remove_dir "%MODELS_DIR%"
call :remove_dir "%CHECKPOINTS_DIR%"
call :remove_dir "%PROJECTS_DIR%"
if exist "%APPDATA_ROOT%\settings.json" del /q "%APPDATA_ROOT%\settings.json"
if exist "%APPDATA_ROOT%\state.json" del /q "%APPDATA_ROOT%\state.json"
if exist "%APPDATA_ROOT%\preferences.json" del /q "%APPDATA_ROOT%\preferences.json"
if exist "%APPDATA_ROOT%\logs" call :remove_dir "%APPDATA_ROOT%\logs"
call :remove_dir "%LOCAL_VOICES%"
goto done

:done
echo.
echo [Uninstall] Completed.
exit /b 0
