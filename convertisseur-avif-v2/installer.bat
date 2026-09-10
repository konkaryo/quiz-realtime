@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==================================================
echo Installation du convertisseur JPG vers AVIF
echo ==================================================
echo.

REM Determine la commande Python a utiliser.
where py >nul 2>&1
if %errorlevel%==0 (
    set "PY=py"
) else (
    where python >nul 2>&1
    if %errorlevel%==0 (
        set "PY=python"
    ) else (
        echo ERREUR : Python n'a pas ete trouve.
        echo Installez Python depuis python.org puis relancez ce fichier.
        echo Pendant l'installation, cochez "Add python.exe to PATH".
        echo.
        pause
        exit /b 1
    )
)

echo Python detecte :
%PY% --version
echo.

REM Certaines installations Python n'installent pas pip par defaut.
echo Verification de pip...
%PY% -m pip --version >nul 2>&1

if errorlevel 1 (
    echo pip n'est pas installe. Installation automatique de pip...
    %PY% -m ensurepip --upgrade

    if errorlevel 1 (
        echo.
        echo ERREUR : impossible d'installer pip avec ensurepip.
        echo Il faudra reparer/reinstaller Python avec pip active.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Mise a jour de pip...
%PY% -m pip install --upgrade pip

if errorlevel 1 (
    echo.
    echo ERREUR lors de la mise a jour de pip.
    pause
    exit /b 1
)

echo.
echo Installation des bibliotheques...
%PY% -m pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo ERREUR : installation des bibliotheques impossible.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo Installation terminee avec succes.
echo ==================================================
echo.
echo Placez vos JPG/JPEG dans le dossier "input",
echo puis double-cliquez sur "convertir.bat".
echo.
pause
