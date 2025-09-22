// server/src/ingest.ts
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import { parse } from "csv-parse";
import { z } from "zod";
import { PrismaClient, Prisma, Theme } from "@prisma/client";

const prisma = new PrismaClient();

const Row = z.object({
  question: z.string().min(1),
  A: z.string().min(1),
  B: z.string().min(1),
  C: z.string().min(1),
  D: z.string().min(1),
  theme: z.string().optional().nullable(),
  difficulte: z.string().optional().nullable(),
  img: z.string().optional().nullable(),
  fuzzy: z.string().optional().nullable(), // variantes "fuzzy" séparées par |
});

type Parsed = {
  text: string;
  correct: string;
  wrongs: [string, string, string];
  theme?: Theme | null;           // 👈 enum Prisma
  difficulty?: string | null;     // "1" | "2" | "3" | "4" | null
  img?: string | null;
  fuzzy?: string[];
};

/* ----------------------- utils ----------------------- */
function normalizeSimple(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, " et ") // unifie & / et
    .trim();
}

// mapping libellé FR -> enum Theme (via clé normalisée)
const THEME_BY_NORM: Record<string, Theme> = {
  "cinema et series": Theme.CINEMA_SERIES,
  "cinema series": Theme.CINEMA_SERIES,

  "arts et culture": Theme.ARTS_CULTURE,
  "arts culture": Theme.ARTS_CULTURE,

  "jeux et bd": Theme.JEUX_BD,
  "jeux bd": Theme.JEUX_BD,
  "bd": Theme.JEUX_BD,

  "geographie": Theme.GEOGRAPHIE,

  "litterature": Theme.LITTERATURE,

  "economie et politique": Theme.ECONOMIE_POLITIQUE,
  "economie politique": Theme.ECONOMIE_POLITIQUE,

  "gastronomie": Theme.GASTRONOMIE,

  "croyances": Theme.CROYANCES,

  "sport": Theme.SPORT,

  "histoire": Theme.HISTOIRE,

  "divers": Theme.DIVERS,

  "sciences de la vie": Theme.SCIENCES_VIE,
  "sciences vie": Theme.SCIENCES_VIE,

  "sciences exactes": Theme.SCIENCES_EXACTES,

  "musique": Theme.MUSIQUE,

  "actualites et medias": Theme.ACTUALITES_MEDIAS,
  "actualites medias": Theme.ACTUALITES_MEDIAS,
  "medias": Theme.ACTUALITES_MEDIAS,

  "technologie": Theme.TECHNOLOGIE,
};

function toEnumTheme(label?: string | null): Theme | null {
  if (!label) return null;
  const key = normalizeSimple(label);
  return THEME_BY_NORM[key] ?? null;
}

/* ----------------------- normalisation "fuzzy" ----------------------- */
function norm(s: string): string {
  let t = (s ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "");

  t = t.replace(/['’`´]/g, "'");
  t = t.replace(/[^a-z0-9]+/g, " ").trim();

  if (!t) return "";

  const STOP = new Set([
    "le","la","les","l","un","une","des","du","de","d","au","aux","et","&","à","en","sur","sous","dans","par","pour",
    "the","a","an","of"
  ]);

  const tokens = t.split(/\s+/).filter(tok => tok && !STOP.has(tok));
  return tokens.join(" ");
}

/* ----------------------- parse CSV ----------------------- */
async function parseCsv(filePath: string): Promise<Parsed[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV introuvable: ${filePath}`);
  }

  const rows: any[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, bom: true }))
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve())
      .on("error", (e) => reject(e));
  });

  if (rows.length === 0) throw new Error("CSV vide ou en-têtes manquants.");

  return rows.map((raw, idx) => {
    const out = Row.safeParse(raw);
    if (!out.success) {
      const msg = out.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Ligne ${idx + 2} invalide : ${msg}`);
    }
    const r = out.data;
    const compact = (s: string) => s.replace(/\s+/g, " ").trim();

    const fuzzyList =
      (r.fuzzy ?? "")
        .split("|")
        .map(v => compact(v))
        .filter(Boolean);

    // difficulté acceptée uniquement "1","2","3","4"
    const d0 = r.difficulte ? compact(r.difficulte) : null;
    const difficulty = d0 && ["1","2","3","4"].includes(d0) ? d0 : null;

    const themeEnum = toEnumTheme(r.theme ?? null);
    if (r.theme && !themeEnum) {
      // on n'arrête pas l'import : on insère la question sans thème et on log
      console.warn(`[ingest] Thème inconnu (ligne ${idx + 2}): "${r.theme}" -> ignoré`);
    }

    return {
      text: compact(r.question),
      correct: compact(r.A),
      wrongs: [compact(r.B), compact(r.C), compact(r.D)] as [string, string, string],
      theme: themeEnum,          // 👈 enum (ou null)
      difficulty,                // 👈 "1".."4" | null
      img: r.img ? r.img.trim() : null,
      fuzzy: fuzzyList,
    };
  });
}

/* -------------- upsert des variantes acceptées pour 1 question -------------- */
async function upsertAcceptedAnswers(
  tx: Prisma.TransactionClient,
  questionId: string,
  correctLabel: string,
  fuzzy?: string[]
) {
  const variants = new Set<string>();

  if (correctLabel) variants.add(correctLabel);
  for (const v of fuzzy ?? []) {
    if (v) variants.add(v);
  }

  for (const v of variants) {
    const n = norm(v);
    if (!n) continue;
    await tx.acceptedAnswer.upsert({
      where: { questionId_norm: { questionId, norm: n } },
      update: {},
      create: { questionId, text: v, norm: n },
    });
  }
}

/* ----------------------- import principal ----------------------- */
export async function loadQuestionCSV(filePath: string) {
  const data = await parseCsv(filePath);

  let inserted = 0;

  for (const q of data) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.question.create({
        data: {
          text: q.text,
          theme: q.theme ?? undefined,          // 👈 enum Prisma (ou undefined)
          difficulty: q.difficulty ?? undefined, // "1".."4" conservé tel quel
          img: q.img ?? undefined,
          choices: {
            create: [
              { label: q.correct,   isCorrect: true },
              { label: q.wrongs[0], isCorrect: false },
              { label: q.wrongs[1], isCorrect: false },
              { label: q.wrongs[2], isCorrect: false },
            ],
          },
        },
        select: { id: true },
      });

      await upsertAcceptedAnswers(tx, created.id, q.correct, q.fuzzy);
      inserted += 1;
    });
  }

  return { inserted };
}

/** Watcher : traite chaque .csv déposé dans IMPORT_DIR */
/*
export function startImportWatcher() {
  const importDir = process.env.IMPORT_DIR || "./import";
  const importedDir = path.resolve(importDir, "../imported");
  const failedDir = path.resolve(importDir, "../failed");

  [importDir, importedDir, failedDir].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const watcher = chokidar.watch(path.join(importDir, "*.csv"), {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  console.log(`[ingest] Watch: ${path.resolve(importDir)} (*.csv)`);

  watcher.on("add", async (file) => {
    const base = path.basename(file);
    console.log(`[ingest] Détecté: ${base}`);
    try {
      const { inserted } = await loadQuestionCSV(file);
      console.log(`[ingest] OK: ${inserted} insérées`);
      const dest = path.join(importedDir, `${Date.now()}-${base}`);
      fs.renameSync(file, dest);
    } catch (err: any) {
      console.error(`[ingest] ÉCHEC ${base}: ${err.message || err}`);
      const dest = path.join(failedDir, `${Date.now()}-${base}`);
      try { fs.renameSync(file, dest); } catch {}
    }
  });

  return watcher;
}
*/
