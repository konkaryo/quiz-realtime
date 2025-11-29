"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importQuestions = importQuestions;
// server/src/ingest.ts
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const Row = zod_1.z.object({
    id: zod_1.z.string().min(1),
    question: zod_1.z.string().min(1),
    A: zod_1.z.string().min(1),
    B: zod_1.z.string().min(1),
    C: zod_1.z.string().min(1),
    D: zod_1.z.string().min(1),
    theme: zod_1.z.string().optional().nullable(),
    difficulte: zod_1.z.string().optional().nullable(),
    img: zod_1.z.string().optional().nullable(),
    fuzzy: zod_1.z.string().optional().nullable(),
});
/* ----------------------- normalisation thèmes ----------------------- */
const THEME_BY_NORM = {
    "Actualités & Médias": client_1.Theme.ACTUALITES_MEDIAS,
    "Arts & Culture": client_1.Theme.ARTS_CULTURE,
    "Cinéma & Séries": client_1.Theme.CINEMA_SERIES,
    "Croyances": client_1.Theme.CROYANCES,
    "Divers": client_1.Theme.DIVERS,
    "Économie & Politique": client_1.Theme.ECONOMIE_POLITIQUE,
    "Gastronomie": client_1.Theme.GASTRONOMIE,
    "Géographie": client_1.Theme.GEOGRAPHIE,
    "Histoire": client_1.Theme.HISTOIRE,
    "Jeux & BD": client_1.Theme.JEUX_BD,
    "Langues & Littérature": client_1.Theme.LANGUES_LITTERATURE,
    "Musique": client_1.Theme.MUSIQUE,
    "Sciences & Techniques": client_1.Theme.SCIENCES_TECHNIQUES,
    "Sciences naturelles": client_1.Theme.SCIENCES_NATURELLES,
    "Sport": client_1.Theme.SPORT,
};
function toEnumTheme(key) {
    if (!key)
        return null;
    return THEME_BY_NORM[key] ?? null;
}
/* ----------------------- normalisation "fuzzy" ----------------------- */
const linkWords = new Set([
    "le", "la", "les", "l", "un", "une", "des", "du", "de", "d", "au", "aux", "et", "&", "à", "en", "sur", "sous", "dans", "par", "pour",
    "the", "a", "an", "of"
]);
function norm(s) {
    let t = (s ?? "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/['’`´]/g, "'");
    t = t.replace(/[^a-z0-9]+/g, " ").trim();
    if (!t)
        return "";
    const tokens = t.split(/\s+/).filter(tok => tok && !linkWords.has(tok));
    return tokens.join(" ");
}
/* ----------------------- parse CSV ----------------------- */
async function parseCsv(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`Erreur - Fichier csv manquant : ${filePath}`);
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
        throw new Error("Erreur - Fichier csv vide");
    const checkDuplicatedIds = new Set();
    return rows.map((raw, idx) => {
        const out = Row.safeParse(raw);
        if (!out.success) {
            const msg = out.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw new Error(`Ligne ${idx + 2} invalide : ${msg}`);
        }
        const r = out.data;
        const compact = (s) => s.replace(/\s+/g, " ").trim();
        const id = compact(r.id).toUpperCase();
        if (!/^[A-Z0-9]{4}$/.test(id)) {
            throw new Error(`Ligne ${idx + 2} invalide : id "${r.id}" doit contenir 4 caractères [A-Z0-9].`);
        }
        if (checkDuplicatedIds.has(id)) {
            throw new Error(`Ligne ${idx + 2} invalide : id "${id}" dupliqué.`);
        }
        checkDuplicatedIds.add(id);
        const fuzzyList = (r.fuzzy ?? "")
            .split("|")
            .map(v => compact(v))
            .filter(Boolean);
        const d0 = r.difficulte ? compact(r.difficulte) : null;
        const difficulty = d0 && ["1", "2", "3", "4"].includes(d0) ? d0 : null;
        const themeEnum = toEnumTheme(r.theme ?? null);
        if (r.theme && !themeEnum) {
            console.warn(`[ingest] Thème inconnu (ligne ${idx + 2}): "${r.theme}" -> ignoré`);
        }
        return {
            id,
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
async function importQuestions(filePath) {
    const data = await parseCsv(filePath);
    let created = 0;
    let updated = 0;
    for (const q of data) {
        await prisma.$transaction(async (tx) => {
            const baseData = {
                text: q.text,
                theme: q.theme ?? null,
                difficulty: q.difficulty ?? null,
                img: q.img ?? null,
            };
            const choicePayload = [
                { label: q.correct, isCorrect: true },
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
            }
            else {
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
