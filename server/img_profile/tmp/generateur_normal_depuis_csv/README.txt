GÉNÉRATEUR CSV -> EXCEL SELON UNE LOI NORMALE
================================================

ENTRÉE
------
Placez un fichier nommé "input.csv" dans le dossier de l'outil.
Sa première colonne doit contenir des valeurs comprises entre 0 et 100.

Un en-tête est facultatif.

Exemple :
niveau
10
25
50
75
90


TRAITEMENT
----------
Pour chaque valeur source X, l'outil génère 10 valeurs :

- moyenne : X
- écart-type : 10
- intervalle autorisé : 0 à 100

Les tirages qui sortent de [0,100] sont rejetés puis retirés.
On obtient donc une loi normale tronquée, sans accumulation artificielle
de valeurs exactement égales à 0 ou 100.


SORTIE
------
Le programme crée automatiquement :

output.xlsx

Le fichier contient 11 colonnes :
- la colonne d'origine ;
- generation_1 ;
- generation_2 ;
- ...
- generation_10.


UTILISATION SOUS WINDOWS
------------------------
1. Double-cliquez sur "installer.bat" une seule fois.
2. Placez votre fichier "input.csv" dans le dossier.
3. Double-cliquez sur "lancer.bat".
4. Récupérez "output.xlsx" dans le même dossier.


PARAMÈTRES MODIFIABLES DANS generateur.py
------------------------------------------
NB_COLONNES_GENEREES = 10
ECART_TYPE = 10.0
MIN_VALUE = 0.0
MAX_VALUE = 100.0
DECIMALES = 2
