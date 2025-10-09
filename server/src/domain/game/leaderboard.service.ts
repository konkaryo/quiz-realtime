// server/src/domain/game/leaderboard.service.ts
import { PrismaClient } from "@prisma/client";
import type { GameState } from "../../types";

/**
 * Construit le leaderboard pour un gameId (ou un sous-ensemble de PlayerGame ids)
 * et applique directement le tie-break:
 *  1) score décroissant
 *  2) en cas d'égalité: ordre de réponse de la manche en cours (answeredOrder)
 *     -> plus tôt = plus haut
 */
export async function buildLeaderboard(
  prisma: PrismaClient,
  gameId: string,
  onlyPgIds?: string[],
  st?: GameState
) {
  const where =
    onlyPgIds && onlyPgIds.length
      ? { id: { in: onlyPgIds } }
      : { gameId }; // fallback (dev / compat)

  const rows = await prisma.playerGame.findMany({
    where,
    // on garde un premier tri DB par score desc pour limiter le travail en mémoire
    orderBy: [{ score: "desc" }],
    select: { id: true, score: true, player: { select: { name: true } } },
  });

  const lb = rows.map((r) => ({
    id: r.id,
    name: r.player.name,
    score: r.score,
  }));

  // Tie-break si on a un GameState (et donc un answeredOrder)
  if (st && Array.isArray((st as any).answeredOrder)) {
    const order: string[] = (st as any).answeredOrder;
    const pos = new Map(order.map((pgId, i) => [pgId, i]));

    lb.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ia = pos.has(a.id) ? (pos.get(a.id) as number) : Number.POSITIVE_INFINITY;
      const ib = pos.has(b.id) ? (pos.get(b.id) as number) : Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib; // plus petit index = a répondu plus tôt
      // 3e critère pour stabilité (optionnel)
      return (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" });
    });
  }

  return lb;
}
