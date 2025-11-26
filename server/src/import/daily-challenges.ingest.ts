// server/src/import/daily-challenges.ingest.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DATE_HEADERS = new Set(["date", "jour", "day"]);

function normalizeQuestionKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`´]/g, "'")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function parseDateToIso(raw: string, rowIndex: number): string {
  const value = (raw || "").trim();
  if (!value) throw new Error(`Ligne ${rowIndex}: colonne DATE vide`);

  const isoMatch = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
        .toString()
        .padStart(2, "0")}`;
    }
  }

  const frMatch = value.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (frMatch) {
    const [, d, m, y] = frMatch;
    const day = Number(d);
    const month = Number(m);
    const year = Number(y);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
        .toString()
        .padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth() + 1;
    const day = parsed.getUTCDate();
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
      .toString()
      .padStart(2, "0")}`;
  }

  throw new Error(`Ligne ${rowIndex}: date invalide "${value}"`);
}

function isoDateToUtc(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map((v) => Number(v));
  if (!year || !month || !day) throw new Error(`Date ISO invalide: ${isoDate}`);
  return new Date(Date.UTC(year, month - 1, day));
}

type CsvChallenge = {
  isoDate: string;
  slots: { label: string; ref: string }[];
};

type QuestionLookup = {
  byId: Map<string, { id: string; text: string }>;
  byNorm: Map<string, { id: string; text: string }[]>;
};

async function buildQuestionLookup(): Promise<QuestionLookup> {
  const rows = await prisma.question.findMany({ select: { id: true, text: true } });
  const byId = new Map<string, { id: string; text: string }>();
  const byNorm = new Map<string, { id: string; text: string }[]>();

  for (const row of rows) {
    byId.set(row.id, row);
    const norm = normalizeQuestionKey(row.text);
    const list = byNorm.get(norm) ?? [];
    list.push(row);
    byNorm.set(norm, list);
  }

  return { byId, byNorm };
}

function resolveQuestionId(ref: string, lookup: QuestionLookup, rowIndex: number, column: string): string {
  const trimmed = (ref || "").trim();
  if (!trimmed) throw new Error(`Ligne ${rowIndex}: colonne "${column}" vide`);

  if (lookup.byId.has(trimmed)) {
    return trimmed;
  }

  const norm = normalizeQuestionKey(trimmed);
  if (!norm) throw new Error(`Ligne ${rowIndex}: référence vide pour "${column}"`);

  const matches = lookup.byNorm.get(norm);
  if (!matches || matches.length === 0) {
    throw new Error(`Ligne ${rowIndex}: question introuvable pour "${column}" -> "${trimmed}"`);
  }

  if (matches.length > 1) {
    const sample = matches.map((m) => `"${m.text}" (#${m.id.slice(0, 8)})`).join(", ");
    throw new Error(`Ligne ${rowIndex}: référence ambiguë "${trimmed}" (${sample})`);
  }

  return matches[0].id;
}

async function parseCsv(filePath: string): Promise<CsvChallenge[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV introuvable: ${filePath}`);
  }

  const rows: any[] = [];
  let parsedHeaders: string[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(
        parse({
          columns: (cols) => {
            parsedHeaders = cols.map((h: string) => (h || "").trim());
            return parsedHeaders;
          },
          trim: true,
          bom: true,
        }),
      )
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve())
      .on("error", (e) => reject(e));
  });

  const headers = parsedHeaders;

  if (!headers || headers.length === 0) {
    throw new Error("daily_challenge.csv: entêtes manquantes");
  }

  const dateHeader = headers.find((h: string) => DATE_HEADERS.has(h.toLowerCase()));
  if (!dateHeader) {
    throw new Error("daily_challenge.csv: aucune colonne 'DATE' trouvée");
  }

  const otherHeaders = headers.filter((h: string) => h !== dateHeader);
  if (otherHeaders.length === 0) {
    throw new Error("daily_challenge.csv: aucune colonne question");
  }

  const lookup = await buildQuestionLookup();
  const challenges: CsvChallenge[] = [];

  rows.forEach((raw, index) => {
    const rowIndex = index + 2; // header + 1-index
    const isoDate = parseDateToIso(String(raw[dateHeader] ?? ""), rowIndex);
    const slots: { label: string; ref: string }[] = [];

    for (const header of otherHeaders) {
      const value = raw[header];
      if (value === undefined || value === null || String(value).trim() === "") continue;
      const questionId = resolveQuestionId(String(value), lookup, rowIndex, header);
      slots.push({ label: header, ref: questionId });
    }

    if (slots.length === 0) {
      console.warn(`[daily-ingest] ${isoDate}: aucune question listée — ignoré.`);
      return;
    }

    challenges.push({ isoDate, slots });
  });

  return challenges;
}

export async function importDailyChallenges(csvRelativePath = "./import/daily_challenge.csv") {
  const csvPath = path.resolve(process.cwd(), csvRelativePath);
  const rows = await parseCsv(csvPath);
  if (rows.length === 0) {
    console.warn("[daily-ingest] Aucun défi importé (fichier vide ?)");
    return { upserted: 0 };
  }

  let upserted = 0;

  for (const row of rows) {
    const dateUtc = isoDateToUtc(row.isoDate);
    await prisma.$transaction(async (tx) => {
      const dailyTx = tx as any;
      const challenge = await dailyTx.dailyChallenge.upsert({
        where: { date: dateUtc },
        create: { date: dateUtc },
        update: {},
        select: { id: true },
      });

      await dailyTx.dailyChallengeQuestion.deleteMany({ where: { challengeId: challenge.id } });

      let position = 0;
      for (const slot of row.slots) {
        await dailyTx.dailyChallengeQuestion.create({
          data: {
            challengeId: challenge.id,
            questionId: slot.ref,
            position
          },
        });
        position += 1;
      }
    });
    upserted += 1;
  }

  console.log(`[daily-ingest] Import OK — ${upserted} défi(s) traités.`);
  return { upserted };
}

export default importDailyChallenges;