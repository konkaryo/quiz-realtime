@echo off
cd /d "%~dp0"
title Installation - Generateur CSV vers Excel
echo.
echo Installation de la dependance openpyxl...
echo.
py -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERREUR : installation impossible.
    echo Verifiez que Python 3 est installe sur votre ordinateur.
    echo.
    pause
    exit /b 1
)
echo.
echo Installation terminee.
echo Placez input.csv dans ce dossier puis lancez "lancer.bat".
echo.
pause
