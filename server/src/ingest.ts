import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import { parse } from "csv-parse";
import { z } from "zod";
import { PrismaClient, Prisma } from "@prisma/client";

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
  fuzzy: z.string().optional().nullable(), // <- nouvelles variantes "fuzzy"
});

type Parsed = {
  text: string;
  correct: string;
  wrongs: [string, string, string];
  theme?: string | null;
  difficulty?: string | null;
  img?: string | null;
  fuzzy?: string[];
};

/* ----------------------- normalisation commune ----------------------- */
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
      .pipe(
        parse({
          columns: true,
          trim: true,
          bom: true,
        })
      )
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

    return {
      text: compact(r.question),
      correct: compact(r.A),
      wrongs: [compact(r.B), compact(r.C), compact(r.D)] as [string, string, string],
      theme: r.theme ? compact(r.theme) : null,
      difficulty: r.difficulte ? compact(r.difficulte) : null,
      img: r.img ? r.img.trim() : null,
      fuzzy: fuzzyList,
    };
  });
}

/* -------------- upsert des variantes acceptées pour 1 question -------------- */
// 👇 IMPORTANT: tx est un Prisma.TransactionClient (et pas PrismaClient)
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
      // nécessite @@unique([questionId, norm]) sur AcceptedAnswer
      where: { questionId_norm: { questionId, norm: n } },
      update: {},
      create: { questionId, text: v, norm: n },
    });
  }
}

/* ----------------------- import principal ----------------------- */
export async function loadQuestionCSV(filePath: string) {
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
