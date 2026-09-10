@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==================================================
echo Conversion JPG / JPEG vers AVIF
echo ==================================================
echo.

where py >nul 2>&1
if %errorlevel%==0 (
    py convert.py
) else (
    python convert.py
)

echo.
pause
