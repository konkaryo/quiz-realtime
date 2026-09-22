@echo off
py generateur_loi_normale.py
if errorlevel 1 (
    echo.
    echo Impossible de lancer le programme.
    echo Lancez d'abord "installer.bat".
    pause
)
