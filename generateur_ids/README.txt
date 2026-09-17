GÉNÉRATEUR D'IDENTIFIANTS UNIQUES — VERSION 2
================================================

CORRECTION EXCEL
----------------
Un fichier CSV ne contient aucune information de type de colonne.
Excel peut donc interpréter automatiquement certains identifiants comme des dates.

Le programme génère désormais DEUX fichiers :

1. id_output.csv
   - CSV brut
   - utile pour les imports techniques

2. id_output.xlsx
   - fichier Excel
   - la colonne "id" est explicitement définie au format TEXTE
   - c'est le fichier recommandé si vous ouvrez les IDs avec Excel

INSTALLATION (UNE SEULE FOIS)
------------------------------
1. Installez Python 3 si nécessaire.
2. Double-cliquez sur "installer.bat".
   Cela installe openpyxl.

UTILISATION
-----------
1. Placez éventuellement vos IDs existants dans "id_input.csv",
   dans la colonne "id".
2. Double-cliquez sur "lancer.bat".
3. Saisissez le nombre TOTAL d'identifiants souhaité.
4. Le programme crée :
   - id_output.csv
   - id_output.xlsx

FORMAT DES IDS
--------------
- 4 caractères
- caractères autorisés :
  23456789abcdefghjklmnpqrstuvwxyz
- caractères exclus :
  0, 1, i, o
- maximum :
  1 048 576 combinaisons
