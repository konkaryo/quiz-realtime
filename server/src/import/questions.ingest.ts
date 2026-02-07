// server/src/ingest.ts
import fs from "fs";
import { parse } from "csv-parse";
import { z } from "zod";
import { PrismaClient, Prisma, Theme } from "@prisma/client";

const prisma = new PrismaClient();

const Row = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  A: z.string().min(1),
  B: z.string().min(1),
  C: z.string().min(1),
  D: z.string().min(1),
  theme: z.string().optional().nullable(),
  difficulte: z.string().optional().nullable(),
  img: z.string().optional().nullable(),
  fuzzy: z.string().optional().nullable(),
});

type Parsed = {
  id: string;
  text: string;
  correct: string;
  wrongs: [string, string, string];
  theme?: Theme | null;
  difficulty?: string | null;
  img?: string | null;
  fuzzy?: string[];
};

/* ----------------------- normalisation thèmes ----------------------- */
const THEME_BY_NORM: Record<string, Theme> = {

  "Arts":                   Theme.ARTS,
  "Audiovisuel":            Theme.AUDIOVISUEL,
  "Croyances":              Theme.CROYANCES,
  "Divers":                 Theme.DIVERS,
  "Gastronomie":            Theme.GASTRONOMIE,
  "Géographie":             Theme.GEOGRAPHIE,
  "Histoire":               Theme.HISTOIRE,
  "Littérature":            Theme.LITTERATURE,
  "Musique":                Theme.MUSIQUE,
  "Nature":                 Theme.NATURE,
  "Pop culture":            Theme.POP_CULTURE,
  "Science":                Theme.SCIENCE,
  "Société":                Theme.SOCIETE,
  "Sport":                  Theme.SPORT,
};

function toEnumTheme(key?: string | null): Theme | null {
  if (!key) return null;
  return THEME_BY_NORM[key] ?? null;
}

/* ----------------------- normalisation "fuzzy" ----------------------- */
const linkWords = new Set([
    "le","la","les","l","un","une","des","du","de","d","au","aux","et","&","à","en","sur","sous","dans","par","pour",
    "the","a","an","of"
]);

function norm(s: string): string {
  let t = (s ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "");

  t = t.replace(/['’`´]/g, "'");
  t = t.replace(/[^a-z0-9]+/g, " ").trim();

  if (!t) return "";

  const tokens = t.split(/\s+/).filter(tok => tok && !linkWords.has(tok));
  return tokens.join(" ");
}

/* ----------------------- parse CSV ----------------------- */
async function parseCsv(filePath: string): Promise<Parsed[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Erreur - Fichier csv manquant : ${filePath}`);
  }

  const rows: any[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, bom: true }))
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve())
      .on("error", (e) => reject(e));
  });

  if (rows.length === 0) throw new Error("Erreur - Fichier csv vide");

  const checkDuplicatedIds = new Set<string>();

  return rows.map((raw, idx) => {
    const out = Row.safeParse(raw);
    if (!out.success) {
      const msg = out.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Ligne ${idx + 2} invalide : ${msg}`);
    }
    const r = out.data;
    const compact = (s: string) => s.replace(/\s+/g, " ").trim();

    const id = compact(r.id).toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      throw new Error(`Ligne ${idx + 2} invalide : id "${r.id}" doit contenir 4 caractères [A-Z0-9].`);
    }
    if (checkDuplicatedIds.has(id)) {
      throw new Error(`Ligne ${idx + 2} invalide : id "${id}" dupliqué.`);
    }
    checkDuplicatedIds.add(id);

    const fuzzyList =
      (r.fuzzy ?? "")
        .split("|")
        .map(v => compact(v))
        .filter(Boolean);

    const d0 = r.difficulte ? compact(r.difficulte) : null;
    const difficulty = d0 && ["1","2","3","4"].includes(d0) ? d0 : null;

    const themeEnum = toEnumTheme(r.theme ?? null);
    if (r.theme && !themeEnum) {
      console.warn(`[ingest] Thème inconnu (ligne ${idx + 2}): "${r.theme}" -> ignoré`);
    }

    return {
      id,
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
export async function importQuestions(filePath: string) {
  const data = await parseCsv(filePath);

  let created = 0;
  let updated = 0;

  for (const q of data) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const baseData = {
        text: q.text,
        theme: q.theme ?? null,
        difficulty: q.difficulty ?? null,
        img: q.img ?? null,
      };

      const choicePayload = [
        { label: q.correct,   isCorrect: true },
        { label: q.wrongs[0], isCorrect: false },
        { label: q.wrongs[1], isCorrect: false },
        { label: q.wrongs[2], isCorrect: false },
      ];

      const questionId = q.id;

      const existing = await tx.question.findUnique({ where: { id: questionId }, select: { id: true } });

      if (existing) {
        await tx.choice.deleteMany({ where: { questionId } });
        await tx.acceptedAnswer.deleteMany({ where: { questionId } });
        await tx.question.update({
          where: { id: questionId },
          data: {
            ...baseData,
            choices: {
              create: choicePayload,
            },
          },
        });
        updated += 1;
      } else {
        await tx.question.create({
          data: {
            id: questionId,
            ...baseData,
            choices: {
              create: choicePayload,
            },
          },
        });
        created += 1;
      }

      await upsertAcceptedAnswers(tx, questionId, q.correct, q.fuzzy);
    });
  }

  return { inserted: created + updated, created, updated };
}
