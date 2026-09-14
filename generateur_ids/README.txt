GÉNÉRATEUR D'IDENTIFIANTS UNIQUES
=================================

Format des IDs
--------------
- 4 caractères
- caractères autorisés :
  23456789abcdefghjklmnpqrstuvwxyz
- caractères exclus :
  0, 1, i, o
- 1 048 576 combinaisons possibles au maximum

UTILISATION
-----------

1. Si vous avez déjà des IDs :
   ouvrez id_input.csv et placez-les dans la colonne "id".

   Exemple :

   id
   7k2m
   ab34
   r8xz

2. Si vous n'avez aucun ID existant :
   laissez simplement id_input.csv avec uniquement son en-tête :

   id

3. Double-cliquez sur :
   lancer.bat

4. Entrez le NOMBRE TOTAL d'identifiants souhaité.
   Les IDs déjà présents sont inclus dans ce total.

5. Le résultat est créé dans :
   id_output.csv

EXEMPLE
-------
id_input.csv contient 3 IDs.
Vous demandez un total de 10 000 IDs.

Résultat :
- 3 IDs existants conservés
- 9 997 nouveaux IDs générés
- 10 000 IDs dans id_output.csv

CONTRÔLES
---------
Le programme bloque notamment :
- les IDs contenant 0, 1, i ou o ;
- les IDs de longueur différente de 4 ;
- les caractères non autorisés ;
- les doublons dans id_input.csv ;
- une demande inférieure au nombre d'IDs existants ;
- une demande supérieure à 1 048 576 IDs.

PRÉREQUIS
---------
Python 3 doit être installé sur Windows.
Aucune bibliothèque supplémentaire n'est nécessaire.
