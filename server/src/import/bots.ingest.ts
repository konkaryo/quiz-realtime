// server/src/domain/import/bots.ingest.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { z } from "zod";
import { PrismaClient, Theme } from "@prisma/client";

const prisma = new PrismaClient();

/* ----------------------- mapping entêtes -> enum Theme ----------------------- */
const THEME_BY_HEADER: Record<string, Theme> = {
  "arts":                 "ARTS",
  "audiovisuel":          "AUDIOVISUEL",
  "croyances":            "CROYANCES",
  "divers":               "DIVERS",
  "gastronomie":          "GASTRONOMIE",
  "geographie":           "GEOGRAPHIE",
  "histoire":             "HISTOIRE",
  "litterature":          "LITTERATURE",
  "musique":              "MUSIQUE",
  "nature":               "NATURE",
  "pop_culture":          "POP_CULTURE",
  "science":              "SCIENCE",
  "societe":              "SOCIETE",
  "sport":                "SPORT",
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
  regularity?: number;
  morning?: number;
  afternoon?: number;
  evening?: number;
  night?: number;
  img?: string;
};

const BOT_ID_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const BOT_ID_BLOCKS = 4;
const BOT_ID_BLOCK_SIZE = 4;

function randomBotPlayerId(): string {
  const blocks: string[] = [];
  for (let i = 0; i < BOT_ID_BLOCKS; i += 1) {
    let block = "";
    for (let j = 0; j < BOT_ID_BLOCK_SIZE; j += 1) {
      const idx = Math.floor(Math.random() * BOT_ID_CHARS.length);
      block += BOT_ID_CHARS[idx];
    }
    blocks.push(block);
  }
  return blocks.join("-");
}

function resolveBotImageName(rawImg?: string, playerId?: string) {
  const imgName = rawImg?.trim();
  const source = imgName ? (imgName.endsWith(".avif") ? imgName : `${imgName}.avif`) : undefined;
  const destination = imgName && playerId ? `${playerId}.avif` : undefined;
  return { source, destination };
}

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
      if (["joueur","vitesse","matin","apres_midi","soir","nuit","img","regularite"].includes(header)) continue;
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
    const regularity = toNum0_1(raw.regularite);

    // normalise si les 4 sont fournis et ne somment pas ≈ 1
    const norm = normalizeIfNeeded(m, ap, so, nu);
    m = norm.a; ap = norm.b; so = norm.c; nu = norm.d;

    const img = raw.img;

    bots.push({
      name: r.joueur.trim(),
      speed: Math.round(r.vitesse),
      skills,
      regularity,
      morning: m,
      afternoon: ap,
      evening: so,
      night: nu,
      img
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
  const allocatedPlayerIds = new Set<string>();
  const importProfilesDir = path.resolve(path.dirname(csvAbsPath), "img", "profiles");
  const destProfilesDir = path.resolve(path.dirname(csvAbsPath), "..", "img", "profiles");
  await fs.promises.rm(destProfilesDir, { recursive: true, force: true });
  await fs.promises.mkdir(destProfilesDir, { recursive: true });
  const defaultProfileSource = path.resolve(importProfilesDir, "0.avif");
  const defaultProfileDest = path.resolve(destProfilesDir, "0.avif");
  if (fs.existsSync(defaultProfileSource)) {
    await fs.promises.copyFile(defaultProfileSource, defaultProfileDest);
  }

  for (const b of bots) {
    await prisma.$transaction(async (tx) => {
    const existingBot = await prisma.bot.findUnique({
      where: { name: b.name },
      select: { playerId: true, player: { select: { id: true } } },
    });
    let playerId = existingBot?.playerId ?? existingBot?.player?.id;
    if (!playerId) {
      do {
        playerId = randomBotPlayerId();
      } while (allocatedPlayerIds.has(playerId));
    }
    if (playerId) allocatedPlayerIds.add(playerId);

    const { source, destination } = resolveBotImageName(b.img, playerId);
    if (source && destination) {
      const sourcePath = path.resolve(importProfilesDir, source);
      const destPath = path.resolve(destProfilesDir, destination);
      if (fs.existsSync(sourcePath)) {
        await fs.promises.copyFile(sourcePath, destPath);
      }
    }
      const playerImg = destination ?? "0.avif";
      const bot = await tx.bot.upsert({
        where: { name: b.name },
        update: {
          speed: b.speed,
          // n’écraser que si fourni (sinon garder les valeurs par défaut DB)
          ...(typeof b.regularity === "number" ? { regularity: b.regularity } : {}),
          ...(typeof b.morning   === "number" ? { morning:   b.morning   } : {}),
          ...(typeof b.afternoon === "number" ? { afternoon: b.afternoon } : {}),
          ...(typeof b.evening   === "number" ? { evening:   b.evening   } : {}),
          ...(typeof b.night     === "number" ? { night:     b.night     } : {}),
          player: { upsert: {
            update: { name: b.name, isBot: true, img: playerImg },
            create: { id: playerId, name: b.name, isBot: true, img: playerImg }
          }},
        },
        create: {
          name:  b.name,
          speed: b.speed,
          ...(typeof b.regularity === "number" ? { regularity: b.regularity } : {}),
          ...(typeof b.morning   === "number" ? { morning:   b.morning   } : {}),
          ...(typeof b.afternoon === "number" ? { afternoon: b.afternoon } : {}),
          ...(typeof b.evening   === "number" ? { evening:   b.evening   } : {}),
          ...(typeof b.night     === "number" ? { night:     b.night     } : {}),
          player: { create: { id: playerId, name: b.name, isBot: true, img: playerImg } },
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
