@echo off
title Installation - Generateur loi normale
echo Installation de la dependance Python...
py -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo Une erreur est survenue.
    echo Verifiez que Python est installe et ajoute au PATH.
    pause
    exit /b 1
)
echo.
echo Installation terminee.
echo Vous pouvez maintenant lancer "lancer.bat".
pause
