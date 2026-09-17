@echo off
cd /d "%~dp0"
title Installation du generateur d'identifiants

echo Installation de la dependance openpyxl...
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 -m pip install openpyxl
    goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
    python -m pip install openpyxl
    goto :done
)

echo ERREUR : Python n'est pas installe ou n'est pas accessible.
echo Installe Python 3 depuis https://www.python.org/downloads/
echo et coche "Add Python to PATH".
pause
exit /b 1

:done
echo.
echo Installation terminee.
pause
