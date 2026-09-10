from pathlib import Path
from PIL import Image, ImageOps

try:
    import pillow_avif  # noqa: F401
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR / "output"

AVIF_QUALITY = 80
OVERWRITE = True
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg"}


def convert_image(source: Path, destination: Path) -> None:
    with Image.open(source) as img:
        img = ImageOps.exif_transpose(img)

        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        destination.parent.mkdir(parents=True, exist_ok=True)
        img.save(destination, format="AVIF", quality=AVIF_QUALITY)


def main() -> int:
    INPUT_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    images = sorted(
        p for p in INPUT_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not images:
        print()
        print("Aucune image JPG/JPEG trouvee dans le dossier 'input'.")
        print()
        return 0

    converted = skipped = errors = 0

    print()
    print(f"{len(images)} image(s) trouvee(s).")
    print(f"Qualite AVIF : {AVIF_QUALITY}")
    print()

    for i, source in enumerate(images, 1):
        destination = OUTPUT_DIR / f"{source.stem}.avif"

        if destination.exists() and not OVERWRITE:
            skipped += 1
            print(f"[{i}/{len(images)}] IGNORE : {source.name}")
            continue

        try:
            convert_image(source, destination)
            converted += 1
            print(f"[{i}/{len(images)}] OK : {source.name} -> {destination.name}")
        except Exception as exc:
            errors += 1
            print(f"[{i}/{len(images)}] ERREUR : {source.name}")
            print(f"    {exc}")

    print()
    print("=" * 50)
    print("Conversion terminee")
    print(f"Converties : {converted}")
    print(f"Ignorees   : {skipped}")
    print(f"Erreurs    : {errors}")
    print("=" * 50)
    print()

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
