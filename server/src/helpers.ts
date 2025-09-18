    import { PrismaClient, Prisma } from "@prisma/client"; 
    import type { Client, RoundQuestion, GameState, EnergyCheck } from "./types";
    import { Server } from "socket.io";

    /* ---------------------------------------------------------------------------------------- */
    // --- Difficulty distribution (room 1..10 -> P(difficulty 1..4)) -----------------
    const QUESTION_DISTRIBUTION: Record<number, [number, number, number, number]> = {
        1: [1,    0,    0,    0   ],
        2: [0.8,  0.2,  0,    0   ],
        3: [0.5,  0.5,  0,    0   ],
        4: [0.25, 0.5,  0.25, 0   ],
        5: [0.2,  0.4,  0.4,  0   ],
        6 :[0,    0.4,  0.4,  0.2 ],
        7: [0,    0.25, 0.5,  0.25],
        8: [0,    0,    0.5,  0.5 ],
        9: [0,    0,    0.2,  0.8 ],
        10:[0,    0,    0,    1   ]
    };
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    /*
    * Calcule des quotas entiers (n1..n4) qui somment à `count` à partir d’un vecteur de
    * probabilités (p1..p4). On arrondit intelligemment (méthode des parties fractionnaires).
    */
    function quotasFromDistribution(probs: [number, number, number, number], count: number): [number, number, number, number] {
        const raw = probs.map(p => p * count);
        const floor = raw.map(Math.floor) as [number, number, number, number];
        let taken = floor.reduce((a, b) => a + b, 0);
        const deficit = count - taken;

        if (deficit > 0) {
            const frac = raw.map((x, i) => ({ i, f: x - Math.floor(x) }));
            frac.sort((a, b) => b.f - a.f);
            for (let k = 0; k < deficit && k < frac.length; k++) { floor[frac[k].i as 0|1|2|3] += 1; }
        }
  
        // Sécurité: si surplus (très rare), on retire aux plus petites fractions
        if (deficit < 0) {
            const frac = raw.map((x, i) => ({ i, f: x - Math.floor(x) }));
            frac.sort((a, b) => a.f - b.f);
            for (let k = 0; k < -deficit && k < frac.length; k++) {
                const idx = frac[k].i as 0|1|2|3;
                if (floor[idx] > 0) floor[idx] -= 1;
            }
        }
        return floor;
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export function toImgUrl(name?: string | null): string | null {
    if (!name) return null;

    if (/^https?:\/\//i.test(name) || name.startsWith("/")) { return name; }

    const cleaned = name
        .replace(/^\.?\/?img\//i, "")
        .replace(/\.(avif|webp|png|jpg|jpeg)$/i, "");

    return `/img/${encodeURIComponent(cleaned)}.avif`;
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export async function getOrCreateCurrentGame(prisma: PrismaClient, roomId: string) {
        // Si une partie est en cours, on la garde.
        const running = await prisma.game.findFirst({ where: { roomId, state: "running" }, orderBy: { createdAt: "desc" } });
        if (running) return running;

        await prisma.game.updateMany({ where: { roomId, state: { in: ["lobby", "ended"] } }, data: { state: "ended" } });

        // Crée une nouvelle partie prête à démarrer
        const fresh = await prisma.game.create({ data: { roomId, state: "lobby" } });
        return fresh;
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    // crée la prochaine game dans la room et recopie les joueurs (PlayerGame)
    export async function createNextGameFrom(prisma: PrismaClient, gameId: string): Promise<{ gameId: string }> {
    const oldGame = await prisma.game.findUnique({ where: { id: gameId } });
    if (!oldGame) throw new Error("Old game not found");

    const pgs: { playerId: string }[] = await prisma.playerGame.findMany({
        where: { gameId: oldGame.id },
        select: { playerId: true },
    });

    const next = await prisma.game.create({
        data: {
        roomId: oldGame.roomId,
        state: "lobby",
        playerGames: {
            create: pgs.map(p => ({ playerId: p.playerId, score: 0 })),
        }
        }
    });

    return { gameId: next.id };
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    // génération de code pour une "Room"
    export function genCode(n = 4) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export function clientsInRoom(clients: Map<string, Client>, roomId: string) {
    return [...clients.values()].filter(c => c.roomId === roomId);
    }
    /* ---------------------------------------------------------------------------------------- */


    /* ---------------------------------------------------------------------------------------- */
    export async function ensurePlayerGamesForRoom(clients: Map<string, Client>, gameId: string, io: Server, prisma: PrismaClient, roomId: string) {
    const members = clientsInRoom(clients, roomId);
    if (members.length === 0) return [];

    // 👇 typer le client de transaction
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const m of members) {
        await tx.playerGame.upsert({
            where: { gameId_playerId: { gameId, playerId: m.playerId } },
            update: {},
            create: { gameId, playerId: m.playerId, score: 0 },
        });
        }
    });

    const pgs = await prisma.playerGame.findMany({
        where: { gameId, playerId: { in: members.map((m) => m.playerId) } },
        select: { id: true, playerId: true },
    });

    // 👇 typer le Map pour éviter '{}' et permettre l’assignation string
    const mapByPlayer = new Map<string, string>(
        pgs.map((x: { id: string; playerId: string }) => [x.playerId, x.id])
    );

    for (const [sid, c] of clients) {
        if (c.roomId !== roomId) continue;
        const newPgId = mapByPlayer.get(c.playerId); // string | undefined
        if (newPgId) {
        c.playerGameId = newPgId; // OK: string
        c.gameId = gameId;
        const s = io.sockets.sockets.get(sid);
        if (s) s.data.gameId = gameId;
        }
    }

    return pgs;
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export function scoreMultiplier(energy: number) {
      const MAX_ENERGY  = Number(process.env.MAX_ENERGY || 100);
      const steps       = Math.floor(Math.max(0, Math.min(MAX_ENERGY, energy)) / 10);
      return 1 + steps * 0.1;
    }
    /* ---------------------------------------------------------------------------------------- */


    /* ---------------------------------------------------------------------------------------- */
    export async function startGameForRoom(clients: Map<string, Client>, gameStates: Map<string, GameState>, io: Server, prisma: PrismaClient, roomId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return;

    const game = await getOrCreateCurrentGame(prisma, room.id);
    const pgs = await ensurePlayerGamesForRoom(clients, game.id, io, prisma, room.id);

    type Row = { id: string };
    const QUESTION_COUNT = Number(process.env.QUESTION_COUNT || 10);

    // 1) Quotas par difficulté selon la room
    const probs = QUESTION_DISTRIBUTION[Math.max(1, Math.min(10, room.difficulty ?? 5))];
    const [n1, n2, n3, n4] = quotasFromDistribution(probs, QUESTION_COUNT);

    // 2) On tire par difficulté (le champ Question.difficulty est actuellement String? -> "1".."4")
    const byDiff: Record<string, number> = {"1": n1, "2": n2, "3": n3, "4": n4};

    let qIds: string[] = [];

    // 2a) premiers tirages par buckets
    for (const [diff, need] of Object.entries(byDiff)) {
        if (need <= 0) continue;
        const rows = await prisma.$queryRaw<Row[]>`
        SELECT "id" FROM "Question"
        WHERE "difficulty" = ${diff}
        AND ("id" NOT IN (${Prisma.join(qIds.length ? qIds : [""])}) OR ${qIds.length === 0})
        ORDER BY random()
        LIMIT ${need};
        `;
        qIds.push(...rows.map(r => r.id));
    }

    // 2b) s'il manque des questions (ex: pas assez dans une diff), on complète avec « any »
    if (qIds.length < QUESTION_COUNT) {
        const remaining = QUESTION_COUNT - qIds.length;
        const fill = await prisma.$queryRaw<Row[]>`
        SELECT "id" FROM "Question"
        WHERE ("id" NOT IN (${Prisma.join(qIds.length ? qIds : [""])} ) OR ${qIds.length === 0})
        ORDER BY random()
        LIMIT ${remaining};
        `;
        qIds.push(...fill.map(r => r.id));
    }

    if (qIds.length === 0) {
        io.to(room.id).emit("error_msg", "No questions in database.");
        return;
    }
    
    const INIT_ENERGY = Number(process.env.INIT_ENERGY || 10);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const pg of pgs) {
            await tx.playerGame.update({ where: { id: pg.id }, data: { questions: { set: [] } } });
            await tx.playerGame.update({
                where: { id: pg.id },
                data: { questions: { connect: qIds.map((id: string) => ({ id })) } }
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

    const full: RoundQuestion[] = raw.map((q: typeof raw[number]) => {
        const correct = q.choices.find((c: typeof q.choices[number]) => c.isCorrect);
        return {
            id: q.id,
            text: q.text,
            theme: q.theme ?? null,
            difficulty: q.difficulty ?? null,
            img: toImgUrl(q.img),
            choices: q.choices,
            acceptedNorms: q.acceptedAnswers.map((a: typeof q.acceptedAnswers[number]) => a.norm),
            correctLabel: correct ? correct.label : "",
        };
    });
    const byId = new Map(full.map((q) => [q.id, q]));
    const ordered: RoundQuestion[] = qIds.map((id: string) => byId.get(id)!).filter(Boolean) as RoundQuestion[];

    const prev = gameStates.get(room.id);
    if (prev?.timer) clearTimeout(prev.timer);

    const st: GameState = {
        roomId: room.id,
        gameId: game.id,
        questions: ordered,
        index: 0,
        answeredThisRound: new Set(),
        pgIds: new Set(pgs.map((p: { id: string }) => p.id)),
        attemptsThisRound: new Map<string, number>(),
    };
    gameStates.set(room.id, st);

    const gameRoom = `game:${st.gameId}`;

    for (const [sid, c] of clients) {
      if (c.roomId !== room.id) continue;
      if (!st.pgIds.has(c.playerGameId)) continue;
      io.sockets.sockets.get(sid)?.join(gameRoom); // penser à leave gameRoom à la fin de partie
    }

    const mult = scoreMultiplier(INIT_ENERGY);
    io.to(gameRoom).emit("energy_update", { energy: INIT_ENERGY, multiplier: mult });

    await startRound(clients, gameStates, io, prisma, st);
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export async function stopGameForRoom(clients: Map<string, Client>, gameStates: Map<string, GameState>, io: Server, prisma: PrismaClient, roomId: string) {
        const st = gameStates.get(roomId);
        if (st?.timer) clearTimeout(st.timer);

        gameStates.delete(roomId);

        if (st?.gameId) {
            try {
                await prisma.game.update({ where: { id: st.gameId }, data: { state: "ended" } });
            } catch {}
        }

        io.to(roomId).emit("game_stopped");
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    function maskCorrect(q: RoundQuestion) {
    return { ...q, choices: q.choices.map((c) => ({ id: c.id, label: c.label })) };
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    async function startRound(clients: Map<string, Client>, gameStates: Map<string, GameState>, io: Server, prisma: PrismaClient, st: GameState) {
    const q = st.questions[st.index];
    if (!q) return;

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

    buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds))
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
    async function endRound(clients: Map<string, Client>, gameStates: Map<string, GameState>, io: Server, prisma: PrismaClient, st: GameState) { // Choisir entre gameStates et st ??

    const q = st.questions[st.index];
    if (!q) return;

    // ✅ Ne prendre que les joueurs liés à la Game courante
    const leaderboard = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));

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
        await prisma.game.update({ where: { id: st.gameId }, data: { state: "ended" } });

        const { gameId: nextGameId } = await createNextGameFrom(prisma, st.gameId);

        if (st.timer) clearTimeout(st.timer);
        gameStates.delete(st.roomId);

        io.to(st.roomId).emit("game_over", {
        nextGameReady: true,
        });

        const GAP_MS = Number(process.env.GAP_MS || 3001);

        setTimeout(async () => {
        // Assigne les PlayerGame pour la nouvelle game aux joueurs connectés
        await ensurePlayerGamesForRoom(clients, nextGameId, io, prisma, st.roomId);
        // Démarre la prochaine game
        await startGameForRoom(clients, gameStates, io, prisma, st.roomId);
        }, GAP_MS);

        

        // Optionnel: auto-démarrer la prochaine game après X secondes (sinon, host clique Start)
        // -> laisse comme ça pour garder le contrôle côté host
        return;
    }

    const GAP_MS = Number(process.env.GAP_MS || 3001);
    st.index += 1;
    st.timer = setTimeout(() => {
        startRound(clients, gameStates, io, prisma, st).catch((err) => {
        console.error("[startRound error]", err);
        });
    },  GAP_MS);
    }
    /* ---------------------------------------------------------------------------------------- */


    /* ---------------------------------------------------------------------------------------- */
    // Deterministic PRNG (Mulberry32) from a 32-bit seed
    function mulberry32(seed: number) {
    return function() {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    // Simple 32-bit hash of a string (for seeding)
    function hash32(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
    }
    /* ---------------------------------------------------------------------------------------- */


    /* ---------------------------------------------------------------------------------------- */
    function seededShuffle<T>(arr: T[], seedStr: string): T[] {
    const rnd = mulberry32(hash32(seedStr));
    const copy = arr.slice();
    // Fisher–Yates with seeded RNG
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export function getShuffledChoicesForSocket(st: GameState, socketId: string) {
    const q = st.questions[st.index];
    const base = q.choices.map(c => ({ id: c.id, label: c.label })); // pas d'isCorrect
    return seededShuffle(base, `${q.id}:${socketId}`);
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export function norm(s: string): string {
    let t = (s ?? "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/['’`´]/g, "'");
    t = t.replace(/[^a-z0-9]+/g, " ").trim();
    if (!t) return "";
    const STOP = new Set(["le","la","les","l","un","une","des","du","de","d","au","aux","et",
        "&","à","en","sur","sous","dans","par","pour","the","a","an","of"]);
    const tokens = t.split(/\s+/).filter(tok => tok && !STOP.has(tok));
    return tokens.join(" ");
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    function maxEditsFor(refLen: number): number {
    if (refLen <= 3)  return 0;           // "Lyon" → tolérance 0
    if (refLen <= 6)  return 1;           // "Paris" → 1 erreur typique
    if (refLen <= 10)  return 2;           // "Manchester" court → 2
    if (refLen <= 15) return 3;
    return Math.min(4, Math.floor(refLen * 0.15));
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    function damerauLevenshteinWithCutoff(a: string, b: string, maxEdits: number): number {
        const n = a.length, m = b.length;
        const diff = Math.abs(n - m);
        if (diff > maxEdits) return maxEdits + 1;

        const INF = maxEdits + 1;

        let prev = new Array(m + 1).fill(INF);
        let curr = new Array(m + 1).fill(INF);
        let prevPrev = new Array(m + 1).fill(INF);

        // ligne 0 : distance à la chaîne vide
        for (let j = 0; j <= m; j++) prev[j] = Math.min(j, INF);

        for (let i = 1; i <= n; i++) {
            const from = Math.max(1, i - maxEdits);
            const to   = Math.min(m, i + maxEdits);

            // re-init ligne courante
            curr.fill(INF);
            curr[0] = Math.min(i, INF);

            let rowMin = curr[0];

            for (let j = from; j <= to; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;

                let val = Math.min(
                 prev[j] + 1,       // suppression
                curr[j - 1] + 1,   // insertion
                prev[j - 1] + cost // substitution
                );

                // transposition (Damerau)
                if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                val = Math.min(val, prevPrev[j - 2] + 1);
                }

                curr[j] = Math.min(val, INF);
                if (curr[j] < rowMin) rowMin = curr[j];
            }

            if (rowMin > maxEdits) return maxEdits + 1;

            // rotation de buffers (pas de copie colonne par colonne)
            [prevPrev, prev, curr] = [prev, curr, prevPrev];
        }

        const dist = prev[m];
        return dist > maxEdits ? maxEdits + 1 : dist;
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export function isFuzzyMatch(userNorm: string, accepted: string[]): boolean {
    if (!userNorm) return false;
    // 1) exact rapide
    if (accepted.includes(userNorm)) return true;

    // 2) sinon fuzzy avec early exit
    for (const acc of accepted) {
        if (!acc) continue;
        const refLen = acc.length;
        const maxEdits = maxEditsFor(refLen);
        if (Math.abs(userNorm.length - refLen) > maxEdits) continue;
        if (userNorm === acc) return true;
        const d = damerauLevenshteinWithCutoff(userNorm, acc, maxEdits);
        if (d <= maxEdits) return true;
    }
    return false;
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export async function buildLeaderboard(prisma: PrismaClient, gameId: string, onlyPgIds?: string[]) {
    const where = onlyPgIds && onlyPgIds.length
        ? { id: { in: onlyPgIds } }
        : { gameId }; // fallback (dev)

    const rows = await prisma.playerGame.findMany({
        where,
        orderBy: [{ score: "desc" }],
        select: { id: true, score: true, player: { select: { name: true } } },
    });

    return rows.map((r: { id: string; score: number; player: { name: string } }) => ({
        id: r.id,
        name: r.player.name,
        score: r.score,
    }));
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export async function spendEnergy(prisma: PrismaClient, client: Client, cost: number) : Promise<EnergyCheck> {
        const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
        if (!pg) return { ok: false };

        if (pg.energy < cost) { return { ok: false }; }

        const newEnergy = pg.energy - cost;

        await prisma.playerGame.update({ where: { id: client.playerGameId }, data: { energy: newEnergy } });
        return { ok: true, energy: newEnergy };
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export async function addEnergy(prisma: PrismaClient, client: Client, gain: number) : Promise<EnergyCheck> {
        const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
        if (!pg) { return { ok: false }; };

        const MAX_ENERGY = Number(process.env.MAX_ENERGY || 100);
        const newEnergy = Math.max(0, Math.min(MAX_ENERGY, pg.energy + gain))
        
        return { ok: true, energy: newEnergy };
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export async function getEnergy(prisma: PrismaClient, client: Client) : Promise<EnergyCheck> {
        const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
        if (!pg) return { ok: false };

        return { ok: true, energy: pg.energy };
    }
    /* ---------------------------------------------------------------------------------------- */

    /* ---------------------------------------------------------------------------------------- */
    export function getCookie(name: string, cookieHeader: string | undefined): string | undefined {
        if (!cookieHeader) return undefined;
        const v = cookieHeader
            .split(";")
            .map((s) => s.trim())
            .find((x) => x.startsWith(name + "="));
    return v ? decodeURIComponent(v.split("=").slice(1).join("=")) : undefined;
    }
    /* ---------------------------------------------------------------------------------------- */