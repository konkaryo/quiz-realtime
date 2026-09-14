import csv
import secrets
import sys
from pathlib import Path

ALPHABET = "23456789abcdefghjklmnpqrstuvwxyz"
ID_LENGTH = 4
MAX_IDS = len(ALPHABET) ** ID_LENGTH

BASE_DIR = Path(__file__).resolve().parent
INPUT_FILE = BASE_DIR / "id_input.csv"
OUTPUT_FILE = BASE_DIR / "id_output.csv"


def is_valid_id(value: str) -> bool:
    return (
        len(value) == ID_LENGTH
        and all(char in ALPHABET for char in value)
    )


def read_existing_ids():
    if not INPUT_FILE.exists():
        # Si le fichier n'existe pas, on considère qu'il n'y a aucun ID existant.
        return []

    with INPUT_FILE.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        if not reader.fieldnames or "id" not in reader.fieldnames:
            raise ValueError(
                'Le fichier "id_input.csv" doit contenir une colonne nommée exactement "id".'
            )

        ids = []
        seen = set()

        for line_number, row in enumerate(reader, start=2):
            raw_value = row.get("id", "")
            value = (raw_value or "").strip().lower()

            # Les lignes vides sont ignorées.
            if not value:
                continue

            if not is_valid_id(value):
                raise ValueError(
                    f'ID invalide à la ligne {line_number} : "{value}". '
                    f"Chaque ID doit contenir exactement {ID_LENGTH} caractères "
                    f"parmi : {ALPHABET}"
                )

            if value in seen:
                raise ValueError(
                    f'Doublon détecté à la ligne {line_number} : "{value}".'
                )

            seen.add(value)
            ids.append(value)

        return ids


def generate_unique_id():
    return "".join(secrets.choice(ALPHABET) for _ in range(ID_LENGTH))


def write_ids(ids):
    with OUTPUT_FILE.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["id"])
        for value in ids:
            writer.writerow([value])


def ask_total(existing_count):
    while True:
        raw = input(
            f"\nNombre total d'identifiants souhaité "
            f"(existants inclus, min. {existing_count}, max. {MAX_IDS}) : "
        ).strip()

        try:
            total = int(raw)
        except ValueError:
            print("Veuillez saisir un nombre entier.")
            continue

        if total < existing_count:
            print(
                f"Le total ne peut pas être inférieur au nombre d'IDs existants "
                f"({existing_count})."
            )
            continue

        if total > MAX_IDS:
            print(
                f"Le total ne peut pas dépasser {MAX_IDS:,} IDs possibles."
                .replace(",", " ")
            )
            continue

        if total < 0:
            print("Le total ne peut pas être négatif.")
            continue

        return total


def main():
    print("=" * 58)
    print(" GENERATEUR D'IDENTIFIANTS UNIQUES")
    print("=" * 58)
    print(f"Format : {ID_LENGTH} caractères")
    print(f"Caractères autorisés : {ALPHABET}")
    print(f"Nombre maximal d'IDs possibles : {MAX_IDS:,}".replace(",", " "))

    try:
        existing_ids = read_existing_ids()
    except Exception as exc:
        print(f"\nERREUR : {exc}")
        return 1

    print(f"\nIDs existants trouvés : {len(existing_ids)}")

    total_needed = ask_total(len(existing_ids))
    new_needed = total_needed - len(existing_ids)

    if new_needed == 0:
        final_ids = list(existing_ids)
    else:
        used = set(existing_ids)
        new_ids = []

        # La génération aléatoire est très efficace tant que l'on ne demande
        # pas une proportion extrême de l'espace total.
        # Pour les très gros volumes, on bascule sur une génération exhaustive
        # afin d'éviter de ralentir à cause des collisions.
        if total_needed <= MAX_IDS // 2:
            while len(new_ids) < new_needed:
                candidate = generate_unique_id()
                if candidate not in used:
                    used.add(candidate)
                    new_ids.append(candidate)
        else:
            import itertools

            for chars in itertools.product(ALPHABET, repeat=ID_LENGTH):
                candidate = "".join(chars)
                if candidate not in used:
                    used.add(candidate)
                    new_ids.append(candidate)
                    if len(new_ids) >= new_needed:
                        break

        final_ids = existing_ids + new_ids

    write_ids(final_ids)

    print("\nTerminé.")
    print(f"IDs existants conservés : {len(existing_ids)}")
    print(f"Nouveaux IDs générés    : {new_needed}")
    print(f"Total dans id_output.csv : {len(final_ids)}")
    print(f"\nFichier créé : {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    try:
        exit_code = main()
    except KeyboardInterrupt:
        print("\n\nOpération annulée.")
        exit_code = 1

    if sys.platform.startswith("win"):
        input("\nAppuyez sur Entrée pour fermer...")

    raise SystemExit(exit_code)
