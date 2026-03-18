"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importDailyChallenges = importDailyChallenges;
// server/src/import/daily-challenges.ingest.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parse_1 = require("csv-parse");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const DATE_HEADERS = new Set(["date", "jour", "day"]);
function normalizeQuestionKey(s) {
    return s
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/['’`´]/g, "'")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase();
}
function parseDateToIso(raw, rowIndex) {
    const value = (raw || "").trim();
    if (!value)
        throw new Error(`Ligne ${rowIndex}: colonne DATE vide`);
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
function isoDateToUtc(isoDate) {
    const [year, month, day] = isoDate.split("-").map((v) => Number(v));
    if (!year || !month || !day)
        throw new Error(`Date ISO invalide: ${isoDate}`);
    return new Date(Date.UTC(year, month - 1, day));
}
async function buildQuestionLookup() {
    const rows = await prisma.question.findMany({ select: { id: true, text: true } });
    const byId = new Map();
    const byNorm = new Map();
    for (const row of rows) {
        byId.set(row.id, row);
        const norm = normalizeQuestionKey(row.text);
        const list = byNorm.get(norm) ?? [];
        list.push(row);
        byNorm.set(norm, list);
    }
    return { byId, byNorm };
}
function resolveQuestionId(ref, lookup, rowIndex, column) {
    const trimmed = (ref || "").trim();
    if (!trimmed)
        throw new Error(`Ligne ${rowIndex}: colonne "${column}" vide`);
    if (lookup.byId.has(trimmed)) {
        return trimmed;
    }
    const norm = normalizeQuestionKey(trimmed);
    if (!norm)
        throw new Error(`Ligne ${rowIndex}: référence vide pour "${column}"`);
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
async function parseCsv(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`CSV introuvable: ${filePath}`);
    }
    const rows = [];
    let parsedHeaders = [];
    await new Promise((resolve, reject) => {
        fs_1.default.createReadStream(filePath)
            .pipe((0, csv_parse_1.parse)({
            columns: (cols) => {
                parsedHeaders = cols.map((h) => (h || "").trim());
                return parsedHeaders;
            },
            trim: true,
            bom: true,
        }))
            .on("data", (r) => rows.push(r))
            .on("end", () => resolve())
            .on("error", (e) => reject(e));
    });
    const headers = parsedHeaders;
    if (!headers || headers.length === 0) {
        throw new Error("daily_challenge.csv: entêtes manquantes");
    }
    const dateHeader = headers.find((h) => DATE_HEADERS.has(h.toLowerCase()));
    if (!dateHeader) {
        throw new Error("daily_challenge.csv: aucune colonne 'DATE' trouvée");
    }
    const otherHeaders = headers.filter((h) => h !== dateHeader);
    if (otherHeaders.length === 0) {
        throw new Error("daily_challenge.csv: aucune colonne question");
    }
    const lookup = await buildQuestionLookup();
    const challenges = [];
    rows.forEach((raw, index) => {
        const rowIndex = index + 2; // header + 1-index
        const isoDate = parseDateToIso(String(raw[dateHeader] ?? ""), rowIndex);
        const slots = [];
        for (const header of otherHeaders) {
            const value = raw[header];
            if (value === undefined || value === null || String(value).trim() === "")
                continue;
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
async function importDailyChallenges(csvRelativePath = "./import/daily_challenge.csv") {
    const csvPath = path_1.default.resolve(process.cwd(), csvRelativePath);
    const rows = await parseCsv(csvPath);
    if (rows.length === 0) {
        console.warn("[daily-ingest] Aucun défi importé (fichier vide ?)");
        return { upserted: 0 };
    }
    let upserted = 0;
    for (const row of rows) {
        const dateUtc = isoDateToUtc(row.isoDate);
        await prisma.$transaction(async (tx) => {
            const dailyTx = tx;
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
exports.default = importDailyChallenges;
