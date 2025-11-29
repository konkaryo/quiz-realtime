"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyRoutes = dailyRoutes;
const zod_1 = require("zod");
const daily_service_1 = require("../domain/daily/daily.service");
const daily_score_service_1 = require("../domain/daily/daily-score.service");
function parseMonth(input) {
    const now = new Date();
    if (!input) {
        return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() };
    }
    const trimmed = input.trim();
    if (!trimmed) {
        return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() };
    }
    const match = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
        throw new Error("Paramètre month invalide (attendu YYYY-MM)");
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        throw new Error("Paramètre month invalide (attendu YYYY-MM)");
    }
    return { year, monthIndex: month - 1 };
}
function todayIso() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
    const day = now.getUTCDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function dailyRoutes({ prisma }) {
    return async function register(app) {
        app.get("/calendar", async (req, reply) => {
            try {
                const monthParam = req.query?.month;
                const { year, monthIndex } = parseMonth(monthParam);
                const summaries = await (0, daily_service_1.listChallengesForMonth)(prisma, year, monthIndex);
                return reply.send({
                    month: { year, month: monthIndex + 1 },
                    today: todayIso(),
                    challenges: summaries,
                });
            }
            catch (err) {
                req.log.error(err, "[GET /daily/calendar]");
                return reply.code(400).send({ error: err?.message || "invalid_month" });
            }
        });
        app.get("/challenges/:date", async (req, reply) => {
            const Params = zod_1.z.object({ date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
            const parsed = Params.safeParse(req.params);
            if (!parsed.success) {
                return reply.code(400).send({ error: "invalid_date" });
            }
            const dateIso = parsed.data.date;
            const challenge = (0, daily_service_1.toPublicChallenge)(await (0, daily_service_1.getChallengeByDate)(prisma, dateIso));
            if (!challenge) {
                return reply.code(404).send({ error: "not_found" });
            }
            return reply.send({ challenge });
        });
        app.get("/leaderboard/monthly", async (req, reply) => {
            try {
                const monthParam = req.query?.month;
                const { year, monthIndex } = parseMonth(monthParam);
                const leaderboard = await (0, daily_score_service_1.getMonthlyDailyLeaderboard)(prisma, year, monthIndex, 10);
                return reply.send({
                    month: { year, month: monthIndex + 1 },
                    leaderboard,
                });
            }
            catch (err) {
                req.log.error(err, "[GET /daily/leaderboard/monthly]");
                return reply.code(400).send({ error: err?.message || "invalid_month" });
            }
        });
        app.get("/leaderboard/daily/:date", async (req, reply) => {
            const Params = zod_1.z.object({ date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
            const parsed = Params.safeParse(req.params);
            if (!parsed.success) {
                return reply.code(400).send({ error: "invalid_date" });
            }
            const { leaderboard, found } = await (0, daily_score_service_1.getDailyLeaderboardForDate)(prisma, parsed.data.date, 10);
            if (!found) {
                return reply.code(404).send({ error: "not_found" });
            }
            return reply.send({ leaderboard });
        });
    };
}
exports.default = dailyRoutes;
