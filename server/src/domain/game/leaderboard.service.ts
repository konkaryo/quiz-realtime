// server/src/domain/game/leaderboard.service.ts
import { PrismaClient } from "@prisma/client";
import type { GameState } from "../../types";
import * as media_service from "../media/media.service";


type LeaderboardRow = {
  id: string;
  name: string;
  score: number;
  img: string | null;
  experience: number;
};

function sortWithTieBreak(lb: LeaderboardRow[], st?: GameState) {
  if (st && Array.isArray((st as any).answeredOrder)) {
    const order: string[] = (st as any).answeredOrder;
    const pos = new Map(order.map((pgId, i) => [pgId, i]));

    lb.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ia = pos.has(a.id) ? (pos.get(a.id) as number) : Number.POSITIVE_INFINITY;
      const ib = pos.has(b.id) ? (pos.get(b.id) as number) : Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib;
      return (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" });
    });

    return lb;
  }

  lb.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" });
  });

  return lb;
}




export async function buildLeaderboard(prisma: PrismaClient, gameId: string, onlyPgIds?: string[], st?: GameState) {
  if (st?.playerData) {
    const ids = onlyPgIds && onlyPgIds.length ? onlyPgIds : Array.from(st.playerData.keys());
    if (!ids.length) return [] as LeaderboardRow[];

    const missingMeta = ids.filter((id) => !(st.playerData.get(id)?.name));
    const metaByPgId = new Map<string, { name: string; img: string | null; experience: number }>();

    if (missingMeta.length) {
      const rows = await prisma.playerGame.findMany({
        where: { id: { in: missingMeta } },
        select: { id: true, player: { select: { name: true, img: true, experience: true } } },
      });
      rows.forEach((r) =>
        metaByPgId.set(r.id, { name: r.player.name, img: r.player.img, experience: r.player.experience }),
      );
    }

    const lb = ids
      .map((id) => {
        const data = st.playerData.get(id);
        if (!data) return null;
        const meta = metaByPgId.get(id);
        const name = data.name ?? meta?.name ?? "";
        const img = media_service.toProfileUrl(data.img ?? meta?.img ?? null);
        return {
          id,
          name,
          score: data.score,
          img,
          experience: data.experience ?? meta?.experience ?? 0,
        } as LeaderboardRow;
      })
      .filter(Boolean) as LeaderboardRow[];

    return sortWithTieBreak(lb, st);
  }
  const where =
    onlyPgIds && onlyPgIds.length
      ? { id: { in: onlyPgIds } }
      : { gameId }; // fallback (dev / compat)

  const rows = await prisma.playerGame.findMany({
    where,
    // on garde un premier tri DB par score desc pour limiter le travail en mémoire
    orderBy: [{ score: "desc" }],
    select: { id: true, score: true, player: { select: { name: true, img: true, experience: true } } },
  });

  const lb = rows.map((r) => ({
    id: r.id,
    name: r.player.name,
    score: r.score,
    img: media_service.toProfileUrl(r.player.img),
    experience: r.player.experience,
  }));

  return sortWithTieBreak(lb, st);
}
