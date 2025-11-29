"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importBots = importBots;
// server/src/domain/import/bots.ingest.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parse_1 = require("csv-parse");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/* ----------------------- mapping entêtes -> enum Theme ----------------------- */
const THEME_BY_HEADER = {
    "arts_culture": "ARTS_CULTURE",
    "cinema_series": "CINEMA_SERIES",
    "croyances": "CROYANCES",
    "economie_politique": "ECONOMIE_POLITIQUE",
    "gastronomie": "GASTRONOMIE",
    "geographie": "GEOGRAPHIE",
    "histoire": "HISTOIRE",
    "jeux_bd": "JEUX_BD",
    "langues_litterature": "LANGUES_LITTERATURE",
    "actualites_medias": "ACTUALITES_MEDIAS",
    "musique": "MUSIQUE",
    "sciences_techniques": "SCIENCES_TECHNIQUES",
    "sciences_naturelles": "SCIENCES_NATURELLES",
    "sport": "SPORT",
    "divers": "DIVERS",
};
/* ----------------------------- CSV -> objets ----------------------------- */
// on ne valide que les colonnes sûres ici (joueur / vitesse).
// Les 4 colonnes de créneau horaire sont traitées manuellement pour supporter
// virgules, pourcentages, vides, etc.
const CsvRow = zod_1.z.object({
    joueur: zod_1.z.string().min(1),
    vitesse: zod_1.z.coerce.number().min(0).max(100),
}).catchall(zod_1.z.any());
function toNum0_1(raw) {
    if (raw === null || raw === undefined)
        return undefined;
    let s = String(raw).trim();
    if (!s)
        return undefined;
    // enlève % et remplace virgule par point
    const hasPercent = s.endsWith("%");
    if (hasPercent)
        s = s.slice(0, -1);
    s = s.replace(",", ".");
    let n = parseFloat(s);
    if (Number.isNaN(n))
        return undefined;
    // 30% -> 0.3 ; 30 -> 0.3 (si >1, on suppose %)
    if (hasPercent || n > 1)
        n = n / 100;
    // clamp
    n = Math.max(0, Math.min(1, n));
    return n;
}
function normalizeIfNeeded(a, b, c, d) {
    const vals = [a, b, c, d].filter((v) => typeof v === "number");
    if (vals.length === 0)
        return { a, b, c, d }; // rien fourni → laisser défauts Prisma
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
async function parseBotsCsv(filePath) {
    if (!fs_1.default.existsSync(filePath))
        return [];
    const rows = [];
    await new Promise((resolve, reject) => {
        fs_1.default.createReadStream(filePath)
            .pipe((0, csv_parse_1.parse)({ columns: true, trim: true, bom: true }))
            .on("data", (r) => rows.push(r))
            .on("end", () => resolve())
            .on("error", (e) => reject(e));
    });
    const bots = [];
    for (const [idx, raw] of rows.entries()) {
        const out = CsvRow.safeParse(raw);
        if (!out.success) {
            const msg = out.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw new Error(`bots.csv: ligne ${idx + 2} invalide: ${msg}`);
        }
        const r = out.data;
        // ---- compétences par thème (colonnes “matières”) ----
        const skills = [];
        for (const [header, val] of Object.entries(raw)) {
            if (["joueur", "vitesse", "matin", "apres_midi", "soir", "nuit", "img"].includes(header))
                continue;
            const theme = THEME_BY_HEADER[header];
            if (!theme)
                continue;
            const n = Number(String(val).replace(",", "."));
            if (Number.isFinite(n))
                skills.push({ theme, value: Math.max(0, Math.min(100, Math.round(n))) });
        }
        // ---- créneaux horaires (tolère virgules, %, entiers) ----
        let m = toNum0_1(raw.matin);
        let ap = toNum0_1(raw.apres_midi);
        let so = toNum0_1(raw.soir);
        let nu = toNum0_1(raw.nuit);
        // normalise si les 4 sont fournis et ne somment pas ≈ 1
        const norm = normalizeIfNeeded(m, ap, so, nu);
        m = norm.a;
        ap = norm.b;
        so = norm.c;
        nu = norm.d;
        const img = raw.img;
        bots.push({
            name: r.joueur.trim(),
            speed: Math.round(r.vitesse),
            skills,
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
async function importBots(csvAbsPath = path_1.default.resolve(__dirname, "../import/bots.csv")) {
    const bots = await parseBotsCsv(csvAbsPath);
    if (bots.length === 0) {
        console.log("[bots] Aucun bot à importer (fichier manquant ou vide).");
        return { inserted: 0, updated: 0 };
    }
    let inserted = 0, updated = 0;
    for (const b of bots) {
        await prisma.$transaction(async (tx) => {
            const playerImg = (b.img && b.img.trim()) || "0";
            const bot = await tx.bot.upsert({
                where: { name: b.name },
                update: {
                    speed: b.speed,
                    // n’écraser que si fourni (sinon garder les valeurs par défaut DB)
                    ...(typeof b.morning === "number" ? { morning: b.morning } : {}),
                    ...(typeof b.afternoon === "number" ? { afternoon: b.afternoon } : {}),
                    ...(typeof b.evening === "number" ? { evening: b.evening } : {}),
                    ...(typeof b.night === "number" ? { night: b.night } : {}),
                    player: { upsert: {
                            update: { name: b.name, isBot: true, img: playerImg },
                            create: { name: b.name, isBot: true, img: playerImg }
                        } },
                },
                create: {
                    name: b.name,
                    speed: b.speed,
                    ...(typeof b.morning === "number" ? { morning: b.morning } : {}),
                    ...(typeof b.afternoon === "number" ? { afternoon: b.afternoon } : {}),
                    ...(typeof b.evening === "number" ? { evening: b.evening } : {}),
                    ...(typeof b.night === "number" ? { night: b.night } : {}),
                    player: { create: { name: b.name, isBot: true, img: playerImg } },
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
exports.default = importBots;
