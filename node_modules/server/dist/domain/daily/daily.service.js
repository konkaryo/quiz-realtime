"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listChallengesForMonth = listChallengesForMonth;
exports.getChallengeByDate = getChallengeByDate;
exports.toPublicChallenge = toPublicChallenge;
const media_service_1 = require("../media/media.service");
function isoDate(date) {
    return date.toISOString().slice(0, 10);
}
function monthRange(year, monthIndex) {
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 1));
    return { start, end };
}
async function listChallengesForMonth(prisma, year, monthIndex) {
    const { start, end } = monthRange(year, monthIndex);
    const rows = (await prisma.dailyChallenge.findMany({
        where: { date: { gte: start, lt: end } },
        include: {
            entries: {
                orderBy: { position: "asc" },
                include: {
                    question: {
                        select: { id: true, theme: true, difficulty: true },
                    },
                },
            },
        },
        orderBy: { date: "asc" },
    }));
    return rows.map((row) => {
        const slotLabels = row.entries.map((entry) => entry.slotLabel ?? "");
        const themeCounts = {};
        let diffSum = 0;
        let diffCount = 0;
        row.entries.forEach((entry) => {
            const theme = entry.question?.theme;
            if (theme) {
                themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
            }
            const diff = entry.question?.difficulty;
            const n = diff ? Number(diff) : NaN;
            if (Number.isFinite(n)) {
                diffSum += n;
                diffCount += 1;
            }
        });
        const difficultyAverage = diffCount > 0 ? diffSum / diffCount : null;
        return {
            date: isoDate(row.date),
            questionCount: row.entries.length,
            slotLabels,
            themeCounts,
            difficultyAverage,
        };
    });
}
async function getChallengeByDate(prisma, dateIso) {
    const [year, month, day] = dateIso.split("-").map((v) => Number(v));
    if (!year || !month || !day)
        return null;
    const start = new Date(Date.UTC(year, month - 1, day));
    const end = new Date(Date.UTC(year, month - 1, day + 1));
    const row = (await prisma.dailyChallenge.findFirst({
        where: { date: { gte: start, lt: end } },
        include: {
            entries: {
                orderBy: { position: "asc" },
                include: {
                    question: {
                        select: {
                            id: true,
                            text: true,
                            theme: true,
                            difficulty: true,
                            img: true,
                            choices: { select: { id: true, label: true, isCorrect: true } },
                            acceptedAnswers: { select: { norm: true } },
                        },
                    },
                },
            },
        },
    }));
    if (!row)
        return null;
    const questions = row.entries
        .filter((entry) => entry.question)
        .map((entry) => {
        const q = entry.question;
        const correct = q.choices.find((choice) => choice.isCorrect);
        return {
            id: q.id,
            text: q.text,
            theme: q.theme ?? null,
            difficulty: q.difficulty ?? null,
            img: (0, media_service_1.toImgUrl)(q.img),
            choices: q.choices.map((choice) => ({
                id: choice.id,
                label: choice.label,
                isCorrect: choice.isCorrect,
            })),
            acceptedNorms: q.acceptedAnswers.map((ans) => ans.norm),
            correctLabel: correct?.label ?? "",
            slotLabel: entry.slotLabel ?? null,
            position: entry.position,
        };
    });
    return {
        id: row.id,
        date: isoDate(row.date),
        questionCount: questions.length,
        questions,
    };
}
function toPublicChallenge(detail) {
    if (!detail)
        return null;
    return {
        date: detail.date,
        questionCount: detail.questionCount,
        questions: detail.questions.map((q) => ({
            id: q.id,
            text: q.text,
            theme: q.theme,
            difficulty: q.difficulty,
            img: q.img,
            slotLabel: q.slotLabel,
            position: q.position,
            // Strip correctness/accepted norms
            choices: q.choices.map((c) => ({ id: c.id, label: c.label })),
        })),
    };
}
