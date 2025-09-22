"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadQuestionCSV = loadQuestionCSV;
// server/src/ingest.ts
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const Row = zod_1.z.object({
    question: zod_1.z.string().min(1),
    A: zod_1.z.string().min(1),
    B: zod_1.z.string().min(1),
    C: zod_1.z.string().min(1),
    D: zod_1.z.string().min(1),
    theme: zod_1.z.string().optional().nullable(),
    difficulte: zod_1.z.string().optional().nullable(),
    img: zod_1.z.string().optional().nullable(),
    fuzzy: zod_1.z.string().optional().nullable(), // variantes "fuzzy" séparées par |
});
/* ----------------------- utils ----------------------- */
function normalizeSimple(s) {
    return (s || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/\s*&\s*/g, " et ") // unifie & / et
        .trim();
}
// mapping libellé FR -> enum Theme (via clé normalisée)
const THEME_BY_NORM = {
    "cinema et series": client_1.Theme.CINEMA_SERIES,
    "cinema series": client_1.Theme.CINEMA_SERIES,
    "arts et culture": client_1.Theme.ARTS_CULTURE,
    "arts culture": client_1.Theme.ARTS_CULTURE,
    "jeux et bd": client_1.Theme.JEUX_BD,
    "jeux bd": client_1.Theme.JEUX_BD,
    "bd": client_1.Theme.JEUX_BD,
    "geographie": client_1.Theme.GEOGRAPHIE,
    "litterature": client_1.Theme.LITTERATURE,
    "economie et politique": client_1.Theme.ECONOMIE_POLITIQUE,
    "economie politique": client_1.Theme.ECONOMIE_POLITIQUE,
    "gastronomie": client_1.Theme.GASTRONOMIE,
    "croyances": client_1.Theme.CROYANCES,
    "sport": client_1.Theme.SPORT,
    "histoire": client_1.Theme.HISTOIRE,
    "divers": client_1.Theme.DIVERS,
    "sciences de la vie": client_1.Theme.SCIENCES_VIE,
    "sciences vie": client_1.Theme.SCIENCES_VIE,
    "sciences exactes": client_1.Theme.SCIENCES_EXACTES,
    "musique": client_1.Theme.MUSIQUE,
    "actualites et medias": client_1.Theme.ACTUALITES_MEDIAS,
    "actualites medias": client_1.Theme.ACTUALITES_MEDIAS,
    "medias": client_1.Theme.ACTUALITES_MEDIAS,
    "technologie": client_1.Theme.TECHNOLOGIE,
};
function toEnumTheme(label) {
    if (!label)
        return null;
    const key = normalizeSimple(label);
    return THEME_BY_NORM[key] ?? null;
}
/* ----------------------- normalisation "fuzzy" ----------------------- */
function norm(s) {
    let t = (s ?? "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/['’`´]/g, "'");
    t = t.replace(/[^a-z0-9]+/g, " ").trim();
    if (!t)
        return "";
    const STOP = new Set([
        "le", "la", "les", "l", "un", "une", "des", "du", "de", "d", "au", "aux", "et", "&", "à", "en", "sur", "sous", "dans", "par", "pour",
        "the", "a", "an", "of"
    ]);
    const tokens = t.split(/\s+/).filter(tok => tok && !STOP.has(tok));
    return tokens.join(" ");
}
/* ----------------------- parse CSV ----------------------- */
async function parseCsv(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`CSV introuvable: ${filePath}`);
    }
    const rows = [];
    await new Promise((resolve, reject) => {
        fs_1.default.createReadStream(filePath)
            .pipe((0, csv_parse_1.parse)({ columns: true, trim: true, bom: true }))
            .on("data", (r) => rows.push(r))
            .on("end", () => resolve())
            .on("error", (e) => reject(e));
    });
    if (rows.length === 0)
        throw new Error("CSV vide ou en-têtes manquants.");
    return rows.map((raw, idx) => {
        const out = Row.safeParse(raw);
        if (!out.success) {
            const msg = out.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw new Error(`Ligne ${idx + 2} invalide : ${msg}`);
        }
        const r = out.data;
        const compact = (s) => s.replace(/\s+/g, " ").trim();
        const fuzzyList = (r.fuzzy ?? "")
            .split("|")
            .map(v => compact(v))
            .filter(Boolean);
        // difficulté acceptée uniquement "1","2","3","4"
        const d0 = r.difficulte ? compact(r.difficulte) : null;
        const difficulty = d0 && ["1", "2", "3", "4"].includes(d0) ? d0 : null;
        const themeEnum = toEnumTheme(r.theme ?? null);
        if (r.theme && !themeEnum) {
            // on n'arrête pas l'import : on insère la question sans thème et on log
            console.warn(`[ingest] Thème inconnu (ligne ${idx + 2}): "${r.theme}" -> ignoré`);
        }
        return {
            text: compact(r.question),
            correct: compact(r.A),
            wrongs: [compact(r.B), compact(r.C), compact(r.D)],
            theme: themeEnum, // 👈 enum (ou null)
            difficulty, // 👈 "1".."4" | null
            img: r.img ? r.img.trim() : null,
            fuzzy: fuzzyList,
        };
    });
}
/* -------------- upsert des variantes acceptées pour 1 question -------------- */
async function upsertAcceptedAnswers(tx, questionId, correctLabel, fuzzy) {
    const variants = new Set();
    if (correctLabel)
        variants.add(correctLabel);
    for (const v of fuzzy ?? []) {
        if (v)
            variants.add(v);
    }
    for (const v of variants) {
        const n = norm(v);
        if (!n)
            continue;
        await tx.acceptedAnswer.upsert({
            where: { questionId_norm: { questionId, norm: n } },
            update: {},
            create: { questionId, text: v, norm: n },
        });
    }
}
/* ----------------------- import principal ----------------------- */
async function loadQuestionCSV(filePath) {
    const data = await parseCsv(filePath);
    let inserted = 0;
    for (const q of data) {
        await prisma.$transaction(async (tx) => {
            const created = await tx.question.create({
                data: {
                    text: q.text,
                    theme: q.theme ?? undefined, // 👈 enum Prisma (ou undefined)
                    difficulty: q.difficulty ?? undefined, // "1".."4" conservé tel quel
                    img: q.img ?? undefined,
                    choices: {
                        create: [
                            { label: q.correct, isCorrect: true },
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
