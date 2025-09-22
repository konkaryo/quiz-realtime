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
exports.startGameForRoom = startGameForRoom;
exports.stopGameForRoom = stopGameForRoom;
const client_1 = require("@prisma/client");
const room_service = __importStar(require("../room/room.service"));
const question_service = __importStar(require("../question/question.service"));
const energy_service = __importStar(require("../player/energy.service"));
const lb_service = __importStar(require("../game/leaderboard.service"));
const distribution_1 = require("../question/distribution");
/* ---------------------------------------------------------------------------------------- */
async function startGameForRoom(clients, gameStates, io, prisma, roomId) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room)
        return;
    const game = await room_service.getOrCreateCurrentGame(prisma, room.id);
    const pgs = await room_service.ensurePlayerGamesForRoom(clients, game.id, io, prisma, room.id);
    const QUESTION_COUNT = Number(process.env.QUESTION_COUNT || 10);
    // 1) Quotas par difficulté selon la room
    const probs = distribution_1.QUESTION_DISTRIBUTION[Math.max(1, Math.min(10, room.difficulty ?? 5))];
    const [n1, n2, n3, n4] = (0, distribution_1.quotasFromDistribution)(probs, QUESTION_COUNT);
    // 1bis) Prépare le filtre de thèmes bannis
    const banned = (room.bannedThemes ?? []);
    const bannedSqlList = banned.length > 0 ? client_1.Prisma.join(banned.map(b => client_1.Prisma.sql `${b}::"Theme"`)) : null;
    const andNotBanned = bannedSqlList ? client_1.Prisma.sql `AND ("theme" IS NULL OR "theme" NOT IN (${bannedSqlList}))` : client_1.Prisma.sql ``;
    // 2) On tire par difficulté (le champ Question.difficulty est actuellement String? -> "1".."4")
    const byDiff = { "1": n1, "2": n2, "3": n3, "4": n4 };
    let qIds = [];
    // 2a) premiers tirages par buckets
    for (const [diff, need] of Object.entries(byDiff)) {
        if (need <= 0)
            continue;
        const rows = await prisma.$queryRaw `
        SELECT "id" FROM "Question"
        WHERE "difficulty" = ${diff}
        ${andNotBanned}
        AND ("id" NOT IN (${client_1.Prisma.join(qIds.length ? qIds : [""])}) OR ${qIds.length === 0})
        ORDER BY random()
        LIMIT ${Number(need)};
        `;
        qIds.push(...rows.map(r => r.id));
    }
    // 2b) s'il manque des questions (ex: pas assez dans une diff), on complète avec « any »
    if (qIds.length < QUESTION_COUNT) {
        const remaining = QUESTION_COUNT - qIds.length;
        const fill = await prisma.$queryRaw `
        SELECT "id" FROM "Question"
        WHERE ("id" NOT IN (${client_1.Prisma.join(qIds.length ? qIds : [""])} ) OR ${qIds.length === 0})
        ${andNotBanned}
        ORDER BY random()
        LIMIT ${remaining};
        `;
        qIds.push(...fill.map(r => r.id));
    }
    if (qIds.length === 0) {
        io.to(room.id).emit("error_msg", "No questions in database.");
        return;
    }
    if (qIds.length < Math.min(QUESTION_COUNT)) {
        console.warn(`[question-pick] Only ${qIds.length}/${QUESTION_COUNT} questions could be loaded. ` +
            `Check DB stock, Question.difficulty and banned themes filters.`);
    }
    const INIT_ENERGY = Number(process.env.INIT_ENERGY || 10);
    await prisma.$transaction(async (tx) => {
        for (const pg of pgs) {
            await tx.playerGame.update({ where: { id: pg.id }, data: { questions: { set: [] } } });
            await tx.playerGame.update({
                where: { id: pg.id },
                data: { questions: { connect: qIds.map((id) => ({ id })) } }
            });
        }
        await tx.playerGame.updateMany({
            where: { gameId: game.id, id: { in: pgs.map(p => p.id) } },
            data: { energy: INIT_ENERGY, score: 0 }
        });
        await tx.game.update({ where: { id: game.id }, data: { state: "running" } });
    });
    const raw = await prisma.question.findMany({
        where: { id: { in: qIds } },
        select: {
            id: true, text: true, theme: true, difficulty: true, img: true,
            choices: { select: { id: true, label: true, isCorrect: true } },
            acceptedAnswers: { select: { norm: true } },
        },
    });
    const full = raw.map((q) => {
        const correct = q.choices.find((c) => c.isCorrect);
        return {
            id: q.id,
            text: q.text,
            theme: q.theme ?? null,
            difficulty: q.difficulty ?? null,
            img: question_service.toImgUrl(q.img),
            choices: q.choices,
            acceptedNorms: q.acceptedAnswers.map((a) => a.norm),
            correctLabel: correct ? correct.label : "",
        };
    });
    const byId = new Map(full.map((q) => [q.id, q]));
    const ordered = qIds.map((id) => byId.get(id)).filter(Boolean);
    const prev = gameStates.get(room.id);
    if (prev?.timer)
        clearTimeout(prev.timer);
    const st = {
        roomId: room.id,
        gameId: game.id,
        questions: ordered,
        index: 0,
        answeredThisRound: new Set(),
        pgIds: new Set(pgs.map((p) => p.id)),
        attemptsThisRound: new Map(),
    };
    gameStates.set(room.id, st);
    const gameRoom = `game:${st.gameId}`;
    for (const [sid, c] of clients) {
        if (c.roomId !== room.id)
            continue;
        if (!st.pgIds.has(c.playerGameId))
            continue;
        io.sockets.sockets.get(sid)?.join(gameRoom); // penser à leave gameRoom à la fin de partie
    }
    const mult = energy_service.scoreMultiplier(INIT_ENERGY);
    io.to(gameRoom).emit("energy_update", { energy: INIT_ENERGY, multiplier: mult });
    await startRound(clients, gameStates, io, prisma, st);
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
async function stopGameForRoom(clients, gameStates, io, prisma, roomId) {
    const st = gameStates.get(roomId);
    if (st?.timer)
        clearTimeout(st.timer);
    gameStates.delete(roomId);
    if (st?.gameId) {
        try {
            await prisma.game.update({ where: { id: st.gameId }, data: { state: "ended" } });
        }
        catch { }
    }
    io.to(roomId).emit("game_stopped");
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
async function startRound(clients, gameStates, io, prisma, st) {
    const q = st.questions[st.index];
    if (!q)
        return;
    const ROUND_MS = Number(process.env.ROUND_MS || 10000);
    const TEXT_LIVES = Number(process.env.TEXT_LIVES || 3);
    st.answeredThisRound.clear();
    st.attemptsThisRound = new Map();
    st.answeredThisRound.clear();
    st.roundStartMs = Date.now();
    st.endsAt = st.roundStartMs + ROUND_MS;
    console.log("[round_begin]", { roomId: st.roomId, gameId: st.gameId, index: st.index, endsAt: st.endsAt });
    // ⚠️ N'ENVOIE PAS LES CHOIX
    const masked = { id: q.id, text: q.text, img: q.img, theme: q.theme, difficulty: q.difficulty };
    io.to(st.roomId).emit("round_begin", {
        index: st.index,
        total: st.questions.length,
        endsAt: st.endsAt,
        question: masked,
        textLives: TEXT_LIVES
    });
    lb_service.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds))
        .then(lb => io.to(st.roomId).emit("leaderboard_update", { leaderboard: lb }))
        .catch(err => console.error("[leaderboard startRound]", err));
    st.timer = setTimeout(() => {
        endRound(clients, gameStates, io, prisma, st).catch((err) => {
            console.error("[endRound error]", err);
        });
    }, ROUND_MS);
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
async function endRound(clients, gameStates, io, prisma, st) {
    const q = st.questions[st.index];
    if (!q)
        return;
    // ✅ Ne prendre que les joueurs liés à la Game courante
    const leaderboard = await lb_service.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));
    const correct = q.choices.find((c) => c.isCorrect) || null;
    io.to(st.roomId).emit("round_end", {
        index: st.index,
        correctChoiceId: correct ? correct.id : null,
        correctLabel: correct ? correct.label : null,
        leaderboard
    });
    st.endsAt = undefined;
    const hasNext = st.index + 1 < st.questions.length;
    if (!hasNext) {
        // Marque la game comme terminée
        await prisma.game.update({ where: { id: st.gameId }, data: { state: "ended" } });
        // Le leaderboard final = celui déjà calculé pour ce round
        const finalLeaderboard = leaderboard;
        const FINAL_LB_MS = Number(process.env.FINAL_LB_MS || 10000);
        // On prépare la prochaine game tout de suite (copie des joueurs)
        const { gameId: nextGameId } = await room_service.createNextGameFrom(prisma, st.gameId);
        // On annonce la phase "leaderboard final" au front
        io.to(st.roomId).emit("final_leaderboard", {
            leaderboard: finalLeaderboard,
            displayMs: FINAL_LB_MS,
        });
        // Nettoyage de l'état courant + relance automatique après X secondes
        if (st.timer)
            clearTimeout(st.timer);
        setTimeout(async () => {
            gameStates.delete(st.roomId);
            // Associe les PlayerGame de la nouvelle game aux joueurs connectés
            await room_service.ensurePlayerGamesForRoom(clients, nextGameId, io, prisma, st.roomId);
            // Démarre la nouvelle partie
            await startGameForRoom(clients, gameStates, io, prisma, st.roomId);
        }, FINAL_LB_MS);
        // On sort (pas de round suivant)
        return;
    }
    const GAP_MS = Number(process.env.GAP_MS || 3001);
    st.index += 1;
    st.timer = setTimeout(() => {
        startRound(clients, gameStates, io, prisma, st).catch((err) => {
            console.error("[startRound error]", err);
        });
    }, GAP_MS);
}
/* ---------------------------------------------------------------------------------------- */
