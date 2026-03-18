"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordDailyScoreIfFirst = recordDailyScoreIfFirst;
exports.getDailyChallengeStats = getDailyChallengeStats;
exports.getPlayerMonthlyDailyScore = getPlayerMonthlyDailyScore;
exports.getMonthlyDailyLeaderboard = getMonthlyDailyLeaderboard;
exports.getDailyLeaderboardForDate = getDailyLeaderboardForDate;
// server/src/domain/daily/daily-score.service.ts
const client_1 = require("@prisma/client");
const media_service_1 = require("../media/media.service");
function isMissingDailyScoreTableError(err) {
    return (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
        err.code === "P2021");
}
function monthRange(year, monthIndex) {
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 1));
    return { start, end };
}
async function recordDailyScoreIfFirst(prisma, challengeId, playerId, score) {
    try {
        await prisma.dailyChallengeScore.create({
            data: { challengeId, playerId, score },
        });
        return { created: true };
    }
    catch (err) {
        if (isMissingDailyScoreTableError(err)) {
            return { created: false };
        }
        if (err instanceof client_1.Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            // Duplicate (challengeId, playerId) -> first score already recorded
            return { created: false };
        }
        throw err;
    }
}
async function getDailyChallengeStats(prisma, challengeId, limit = 50) {
    const [aggregate, leaderboard] = await Promise.all([
        prisma.dailyChallengeScore.aggregate({
            where: { challengeId },
            _avg: { score: true },
            _count: { _all: true },
            _max: { score: true },
        }).catch((err) => {
            if (isMissingDailyScoreTableError(err)) {
                return {
                    _avg: { score: null },
                    _count: { _all: 0 },
                    _max: { score: null },
                };
            }
            throw err;
        }),
        prisma.dailyChallengeScore
            .findMany({
            where: { challengeId },
            orderBy: [
                { score: "desc" },
                { createdAt: "asc" },
            ],
            select: {
                score: true,
                player: { select: { id: true, name: true, img: true } },
            },
            take: limit,
        })
            .catch((err) => {
            if (isMissingDailyScoreTableError(err))
                return [];
            throw err;
        }),
    ]);
    return {
        averageScore: aggregate._avg.score ?? null,
        attemptCount: aggregate._count._all,
        bestScore: aggregate._max.score ?? null,
        leaderboard: leaderboard.map((row) => ({
            playerId: row.player.id,
            playerName: row.player.name,
            score: row.score,
            img: (0, media_service_1.toProfileUrl)(row.player.img),
        })),
    };
}
async function getPlayerMonthlyDailyScore(prisma, playerId, year, monthIndex) {
    const { start, end } = monthRange(year, monthIndex);
    const aggregate = await prisma.dailyChallengeScore
        .aggregate({
        where: {
            playerId,
            challenge: { date: { gte: start, lt: end } },
        },
        _sum: { score: true },
        _count: { _all: true },
    })
        .catch((err) => {
        if (isMissingDailyScoreTableError(err)) {
            return { _sum: { score: null }, _count: { _all: 0 } };
        }
        throw err;
    });
    return {
        totalScore: aggregate._sum.score ?? 0,
        challengesPlayed: aggregate._count._all,
    };
}
async function getMonthlyDailyLeaderboard(prisma, year, monthIndex, limit = 10) {
    const { start, end } = monthRange(year, monthIndex);
    const aggregates = await prisma.dailyChallengeScore
        .groupBy({
        by: ["playerId"],
        where: {
            challenge: { date: { gte: start, lt: end } },
        },
        _sum: { score: true },
        _min: { createdAt: true },
        orderBy: [
            { _sum: { score: "desc" } },
            { _min: { createdAt: "asc" } },
        ],
        take: limit,
    })
        .catch((err) => {
        if (isMissingDailyScoreTableError(err))
            return [];
        throw err;
    });
    if (aggregates.length === 0)
        return [];
    const players = await prisma.player.findMany({
        where: { id: { in: aggregates.map((row) => row.playerId) } },
        select: { id: true, name: true, img: true },
    });
    const playerById = new Map(players.map((p) => [p.id, { name: p.name, img: (0, media_service_1.toProfileUrl)(p.img) }]));
    return aggregates.map((row) => ({
        playerId: row.playerId,
        playerName: playerById.get(row.playerId)?.name ?? "",
        score: row._sum?.score ?? 0,
        img: playerById.get(row.playerId)?.img ?? null,
    }));
}
async function getDailyLeaderboardForDate(prisma, dateIso, limit = 10) {
    const [year, month, day] = dateIso.split("-").map((v) => Number(v));
    if (!year || !month || !day)
        return { leaderboard: [], found: false };
    const start = new Date(Date.UTC(year, month - 1, day));
    const end = new Date(Date.UTC(year, month - 1, day + 1));
    const challenge = await prisma.dailyChallenge.findFirst({
        where: { date: { gte: start, lt: end } },
        select: { id: true },
    });
    if (!challenge) {
        return { leaderboard: [], found: false };
    }
    let rows = [];
    try {
        rows = await prisma.dailyChallengeScore.findMany({
            where: { challengeId: challenge.id },
            orderBy: [
                { score: "desc" },
                { createdAt: "asc" },
            ],
            select: {
                score: true,
                player: { select: { id: true, name: true, img: true } },
            },
            take: limit,
        });
    }
    catch (err) {
        if (isMissingDailyScoreTableError(err)) {
            return { leaderboard: [], found: true };
        }
        throw err;
    }
    return {
        leaderboard: rows.map((row) => ({
            playerId: row.player.id,
            playerName: row.player.name,
            score: row.score,
            img: (0, media_service_1.toProfileUrl)(row.player.img),
        })),
        found: true,
    };
}
