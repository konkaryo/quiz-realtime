// server/src/domain/import/bots.ingest.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { z } from "zod";
import { PrismaClient, Theme } from "@prisma/client";

const prisma = new PrismaClient();

/* ----------------------- mapping entêtes -> enum Theme ----------------------- */
const THEME_BY_HEADER: Record<string, Theme> = {
  "arts_culture":         "ARTS_CULTURE",
  "cinema_series":        "CINEMA_SERIES",
  "croyances":            "CROYANCES",
  "economie_politique":   "ECONOMIE_POLITIQUE",
  "gastronomie":          "GASTRONOMIE",
  "geographie":           "GEOGRAPHIE",
  "histoire":             "HISTOIRE",
  "jeux_bd":              "JEUX_BD",
  "langues_litterature":  "LANGUES_LITTERATURE",
  "actualites_medias":    "ACTUALITES_MEDIAS",
  "musique":              "MUSIQUE",
  "sciences_techniques":  "SCIENCES_TECHNIQUES",
  "sciences_vie":         "SCIENCES_VIE",
  "sport":                "SPORT",
  "divers":               "DIVERS",
};

/* ----------------------------- CSV -> objets ----------------------------- */
// on ne valide que les colonnes sûres ici (joueur / vitesse).
// Les 4 colonnes de créneau horaire sont traitées manuellement pour supporter
// virgules, pourcentages, vides, etc.
const CsvRow = z.object({
  joueur:       z.string().min(1),
  vitesse:      z.coerce.number().min(0).max(100),
}).catchall(z.any());

type ParsedBot = {
  name: string;
  speed: number;
  skills: { theme: Theme; value: number }[];
  // 0..1
  morning?: number;
  afternoon?: number;
  evening?: number;
  night?: number;
};

function toNum0_1(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  let s = String(raw).trim();
  if (!s) return undefined;
  // enlève % et remplace virgule par point
  const hasPercent = s.endsWith("%");
  if (hasPercent) s = s.slice(0, -1);
  s = s.replace(",", ".");
  let n = parseFloat(s);
  if (Number.isNaN(n)) return undefined;
  // 30% -> 0.3 ; 30 -> 0.3 (si >1, on suppose %)
  if (hasPercent || n > 1) n = n / 100;
  // clamp
  n = Math.max(0, Math.min(1, n));
  return n;
}

function normalizeIfNeeded(a?: number, b?: number, c?: number, d?: number) {
  const vals = [a, b, c, d].filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return { a, b, c, d }; // rien fourni → laisser défauts Prisma
  const sum = vals.reduce((x, y) => x + y, 0);
  if (sum > 0 && Math.abs(sum - 1) > 1e-6) {
    // normalise pour sommer à 1
    const f = 1 / sum;
    a = typeof a === "number" ? a * f : a;
    b = typeof b === "number" ? b * f : b;
    c = typeof c === "number" ? c * f : c;
    d = typeof d === "number" ? d * f : d;
  }
  return { a, b, c, d };
}

async function parseBotsCsv(filePath: string): Promise<ParsedBot[]> {
  if (!fs.existsSync(filePath)) return [];
  const rows: any[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, bom: true }))
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve())
      .on("error", (e) => reject(e));
  });

  const bots: ParsedBot[] = [];
  for (const [idx, raw] of rows.entries()) {
    const out = CsvRow.safeParse(raw);
    if (!out.success) {
      const msg = out.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`bots.csv: ligne ${idx + 2} invalide: ${msg}`);
    }
    const r = out.data;

    // ---- compétences par thème (colonnes “matières”) ----
    const skills: { theme: Theme; value: number }[] = [];
    for (const [header, val] of Object.entries(raw)) {
      if (["joueur","vitesse","matin","apres_midi","soir","nuit"].includes(header)) continue;
      const theme = THEME_BY_HEADER[header];
      if (!theme) continue;
      const n = Number(String(val).replace(",", "."));
      if (Number.isFinite(n)) skills.push({ theme, value: Math.max(0, Math.min(100, Math.round(n))) });
    }

    // ---- créneaux horaires (tolère virgules, %, entiers) ----
    let m  = toNum0_1(raw.matin);
    let ap = toNum0_1(raw.apres_midi);
    let so = toNum0_1(raw.soir);
    let nu = toNum0_1(raw.nuit);

    // normalise si les 4 sont fournis et ne somment pas ≈ 1
    const norm = normalizeIfNeeded(m, ap, so, nu);
    m = norm.a; ap = norm.b; so = norm.c; nu = norm.d;

    bots.push({
      name: r.joueur.trim(),
      speed: Math.round(r.vitesse),
      skills,
      morning: m,
      afternoon: ap,
      evening: so,
      night: nu,
    });
  }
  return bots;
}

/* ----------------------------- Import principal ----------------------------- */
export async function importBots(csvAbsPath = path.resolve(__dirname, "../import/bots.csv")) {
  const bots = await parseBotsCsv(csvAbsPath);
  if (bots.length === 0) {
    console.log("[bots] Aucun bot à importer (fichier manquant ou vide).");
    return { inserted: 0, updated: 0 };
  }

  let inserted = 0, updated = 0;

  for (const b of bots) {
    await prisma.$transaction(async (tx) => {
      const bot = await tx.bot.upsert({
        where: { name: b.name },
        update: {
          speed: b.speed,
          // n’écraser que si fourni (sinon garder les valeurs par défaut DB)
          ...(typeof b.morning   === "number" ? { morning:   b.morning   } : {}),
          ...(typeof b.afternoon === "number" ? { afternoon: b.afternoon } : {}),
          ...(typeof b.evening   === "number" ? { evening:   b.evening   } : {}),
          ...(typeof b.night     === "number" ? { night:     b.night     } : {}),
          player: { upsert: {
            update: { name: b.name, isBot: true },
            create: { name: b.name, isBot: true }
          }},
        },
        create: {
          name:  b.name,
          speed: b.speed,
          ...(typeof b.morning   === "number" ? { morning:   b.morning   } : {}),
          ...(typeof b.afternoon === "number" ? { afternoon: b.afternoon } : {}),
          ...(typeof b.evening   === "number" ? { evening:   b.evening   } : {}),
          ...(typeof b.night     === "number" ? { night:     b.night     } : {}),
          player: { create: { name: b.name, isBot: true } },
        },
        select: { id: true },
      });

      for (const s of b.skills) {
        await tx.botSkill.upsert({
          where: { botId_theme: { botId: bot.id, theme: s.theme } },
          update: { value: s.value },
          create: { botId: bot.id, theme: s.theme, value: s.value },
        });
      }

      inserted += 1;
    });
  }

  console.log(`[bots] Import OK — ${inserted} bots traités.`);
  return { inserted, updated };
}

export default importBots;
