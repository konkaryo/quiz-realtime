"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadQuestionCSV = loadQuestionCSV;
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
    fuzzy: zod_1.z.string().optional().nullable(), // <- nouvelles variantes "fuzzy"
});
/* ----------------------- normalisation commune ----------------------- */
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
            .pipe((0, csv_parse_1.parse)({
            columns: true,
            trim: true,
            bom: true,
        }))
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
        return {
            text: compact(r.question),
            correct: compact(r.A),
            wrongs: [compact(r.B), compact(r.C), compact(r.D)],
            theme: r.theme ? compact(r.theme) : null,
            difficulty: r.difficulte ? compact(r.difficulte) : null,
            img: r.img ? r.img.trim() : null,
            fuzzy: fuzzyList,
        };
    });
}
/* -------------- upsert des variantes acceptées pour 1 question -------------- */
// 👇 IMPORTANT: tx est un Prisma.TransactionClient (et pas PrismaClient)
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
            // nécessite @@unique([questionId, norm]) sur AcceptedAnswer
            where: { questionId_norm: { questionId, norm: n } },
            update: {},
            create: { questionId, text: v, norm: n },
        });
    }
}
/* ----------------------- import principal ----------------------- */
async function loadQuestionCSV(filePath) {
    const data = await parseCsv(filePath);
    for (const q of data) {
        await prisma.$transaction(async (tx) => {
            const created = await tx.question.create({
                data: {
                    text: q.text,
                    theme: q.theme ?? undefined,
                    difficulty: q.difficulty ?? undefined,
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
        });
    }
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
      const { inserted, skipped } = await loadQuestionCSV(file);
      console.log(`[ingest] OK: ${inserted} insérées, ${skipped} ignorées`);
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
