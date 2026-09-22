GÉNÉRATEUR DE NOMBRES SELON UNE LOI NORMALE
=============================================

Fonctionnement
--------------
L'outil demande :
- la quantité de nombres à générer ;
- la moyenne ;
- l'écart-type.

Il génère ensuite un fichier Excel (.xlsx) contenant :
- les paramètres utilisés ;
- une colonne "Valeur" avec les nombres générés.

Installation sous Windows
-------------------------
1. Installer Python 3 si nécessaire.
2. Extraire tous les fichiers dans un même dossier.
3. Double-cliquer sur "installer.bat".
4. Double-cliquer sur "lancer.bat".
5. Saisir les paramètres puis cliquer sur "Générer le fichier Excel".

Remarques
---------
- La virgule et le point sont tous les deux acceptés comme séparateur décimal.
- Les valeurs sont générées aléatoirement : deux exécutions avec les mêmes
  paramètres ne donnent normalement pas exactement les mêmes nombres.
- L'écart-type doit être supérieur ou égal à 0.
