@echo off
cd /d "%~dp0"
title Generateur d'identifiants uniques

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 generate_ids.py
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    python generate_ids.py
    goto :end
)

echo.
echo ERREUR : Python n'est pas installe ou n'est pas accessible.
echo Installe Python 3 depuis https://www.python.org/downloads/
echo et coche "Add Python to PATH" pendant l'installation.
echo.
pause

:end
