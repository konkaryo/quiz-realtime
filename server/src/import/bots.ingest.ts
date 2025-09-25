// server/src/seed.ts  (extrait)
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { z } from "zod";
import { PrismaClient, Theme } from "@prisma/client";

const prisma = new PrismaClient();

/* ----------------------- mapping entêtes -> enum Theme ----------------------- */
const THEME_BY_HEADER: Record<string, Theme> = {
  "Arts & Culture":       "ARTS_CULTURE",
  "Cinéma & Séries":      "CINEMA_SERIES",
  "Croyances":            "CROYANCES",
  "Économie & Politique": "ECONOMIE_POLITIQUE",
  "Gastronomie":          "GASTRONOMIE",
  "Géographie":           "GEOGRAPHIE",
  "Histoire":             "HISTOIRE",
  "Jeux & BD":            "JEUX_BD",
  "Littérature":          "LITTERATURE",
  "Actualités & Médias":  "ACTUALITES_MEDIAS",
  "Musique":              "MUSIQUE",
  "Sciences de la vie":   "SCIENCES_VIE",
  "Sciences exactes":     "SCIENCES_EXACTES",
  "Sport":                "SPORT",
  "Technologie":          "TECHNOLOGIE",
  "Divers":               "DIVERS",
};

/* ----------------------------- CSV -> objets ----------------------------- */
const CsvRow = z.object({
  joueur:  z.string().min(1),            // nom du bot
  vitesse: z.coerce.number().min(0).max(100),
}).catchall(z.coerce.number().min(0).max(100).optional());

type ParsedBot = {
  name: string;
  speed: number;
  skills: { theme: Theme; value: number }[];
};

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

    // convertit les colonnes de thèmes
    const skills: { theme: Theme; value: number }[] = [];
    for (const [header, val] of Object.entries(raw)) {
      if (header === "joueur" || header === "vitesse") continue;
      const theme = THEME_BY_HEADER[header];
      if (!theme) continue; // ignore colonnes inconnues
      const value = Number(val);
      if (Number.isFinite(value)) {
        skills.push({ theme, value: Math.max(0, Math.min(100, Math.round(value))) });
      }
    }

    bots.push({
      name: r.joueur.trim(),
      speed: Math.round(r.vitesse),
      skills,
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
      // 1) Upsert du BOT + création/maj du Player associé (isBot: true)
      const bot = await tx.bot.upsert({
        where: { name: b.name }, // ou autre clé unique si tu préfères
        update: {
          speed: b.speed,
          player: { update: { name: b.name, isBot: true } },
        },
        create: {
          name:  b.name,
          speed: b.speed,
          player: { create: { name: b.name, isBot: true } }, // <-- crée le Player ici
        },
        select: { id: true },
      });

      // 2) Upsert des skills (1 par thème)
      for (const s of b.skills) {
        await tx.botSkill.upsert({
          where: { botId_theme: { botId: bot.id, theme: s.theme } },
          update: { value: s.value },
          create: { botId: bot.id, theme: s.theme, value: s.value },
        });
      }

      // comptage insert/update grossier
      // (si tu veux être exact, fais un select avant/upsert)
      inserted += 1;
    });
  }

  console.log(`[bots] Import OK — ${inserted} bots traités.`);
  return { inserted, updated };
}

export default importBots;
