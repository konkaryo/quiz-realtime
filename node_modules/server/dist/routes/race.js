"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.raceRoutes = raceRoutes;
const zod_1 = require("zod");
const media_service = __importStar(require("../domain/media/media.service"));
const textmatch_1 = require("../domain/question/textmatch");
function raceRoutes({ prisma }) {
    return async function (app) {
        app.get("/question", async (_req, reply) => {
            try {
                const picks = await prisma.$queryRaw `SELECT "id" FROM "Question" ORDER BY random() LIMIT 1`;
                if (!picks.length) {
                    return reply.code(404).send({ error: "no-question" });
                }
                const q = await prisma.question.findUnique({
                    where: { id: picks[0].id },
                    select: {
                        id: true,
                        text: true,
                        theme: true,
                        difficulty: true,
                        img: true,
                        choices: { select: { id: true, label: true, isCorrect: true } },
                        acceptedAnswers: { select: { norm: true } },
                    },
                });
                if (!q)
                    return reply.code(404).send({ error: "not-found" });
                const correct = q.choices.find((c) => c.isCorrect) ?? null;
                return reply.send({
                    question: {
                        id: q.id,
                        text: q.text,
                        theme: q.theme,
                        difficulty: q.difficulty,
                        img: media_service.toImgUrl(q.img),
                        choices: q.choices.map(({ id, label }) => ({ id, label })),
                        correctChoiceId: correct?.id ?? null,
                        correctLabel: correct?.label ?? null,
                        acceptedNorms: q.acceptedAnswers.map((a) => a.norm),
                    },
                });
            }
            catch (err) {
                app.log.error({ err }, "[race.question] failed");
                return reply.code(500).send({ error: "server-error" });
            }
        });
        app.post("/answer", async (req, reply) => {
            const Body = zod_1.z.object({
                questionId: zod_1.z.string().min(1),
                mode: zod_1.z.enum(["text", "choice"]),
                text: zod_1.z.string().trim().optional(),
                choiceId: zod_1.z.string().optional(),
            });
            const parsed = Body.safeParse(req.body);
            if (!parsed.success) {
                return reply.code(400).send({ error: "bad-request" });
            }
            const { questionId, mode, text = "", choiceId } = parsed.data;
            try {
                const q = await prisma.question.findUnique({
                    where: { id: questionId },
                    select: {
                        choices: { select: { id: true, label: true, isCorrect: true } },
                        acceptedAnswers: { select: { norm: true } },
                    },
                });
                if (!q)
                    return reply.code(404).send({ error: "not-found" });
                const correctChoice = q.choices.find((c) => c.isCorrect) ?? null;
                let correct = false;
                if (mode === "choice") {
                    correct = q.choices.some((c) => c.id === choiceId && c.isCorrect);
                }
                else {
                    const candidate = (0, textmatch_1.norm)(text || "");
                    const accepted = q.acceptedAnswers.map((a) => a.norm);
                    correct = (0, textmatch_1.isFuzzyMatch)(candidate, accepted);
                }
                return reply.send({
                    correct,
                    correctChoiceId: correctChoice?.id ?? null,
                    correctLabel: correctChoice?.label ?? null,
                });
            }
            catch (err) {
                app.log.error({ err }, "[race.answer] failed");
                return reply.code(500).send({ error: "server-error" });
            }
        });
    };
}