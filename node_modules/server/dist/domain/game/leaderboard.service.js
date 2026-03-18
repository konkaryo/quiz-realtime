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
exports.buildLeaderboard = buildLeaderboard;
const media_service = __importStar(require("../media/media.service"));
/**
 * Construit le leaderboard pour un gameId (ou un sous-ensemble de PlayerGame ids)
 * et applique directement le tie-break:
 *  1) score décroissant
 *  2) en cas d'égalité: ordre de réponse de la manche en cours (answeredOrder)
 *     -> plus tôt = plus haut
 */
async function buildLeaderboard(prisma, gameId, onlyPgIds, st) {
    const where = onlyPgIds && onlyPgIds.length
        ? { id: { in: onlyPgIds } }
        : { gameId }; // fallback (dev / compat)
    const rows = await prisma.playerGame.findMany({
        where,
        // on garde un premier tri DB par score desc pour limiter le travail en mémoire
        orderBy: [{ score: "desc" }],
        select: { id: true, score: true, player: { select: { name: true, img: true } } },
    });
    const lb = rows.map((r) => ({
        id: r.id,
        name: r.player.name,
        score: r.score,
        img: media_service.toProfileUrl(r.player.img)
    }));
    // Tie-break si on a un GameState (et donc un answeredOrder)
    if (st && Array.isArray(st.answeredOrder)) {
        const order = st.answeredOrder;
        const pos = new Map(order.map((pgId, i) => [pgId, i]));
        lb.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            const ia = pos.has(a.id) ? pos.get(a.id) : Number.POSITIVE_INFINITY;
            const ib = pos.has(b.id) ? pos.get(b.id) : Number.POSITIVE_INFINITY;
            if (ia !== ib)
                return ia - ib; // plus petit index = a répondu plus tôt
            // 3e critère pour stabilité (optionnel)
            return (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" });
        });
    }
    return lb;
}
