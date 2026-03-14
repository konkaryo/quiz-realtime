-- CreateTable
CREATE TABLE "public"."PlayerGameHistory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerGameId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "finalRank" INTEGER NOT NULL,
    "totalPlayers" INTEGER NOT NULL,
    "finalScore" INTEGER NOT NULL,
    "gameDifficulty" INTEGER NOT NULL,
    "questionResults" JSONB NOT NULL,
    "xpGained" INTEGER NOT NULL DEFAULT 0,
    "bitsGained" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerGameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameHistory_playerGameId_key" ON "public"."PlayerGameHistory"("playerGameId");

-- CreateIndex
CREATE INDEX "PlayerGameHistory_playerId_playedAt_idx" ON "public"."PlayerGameHistory"("playerId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameHistory_playerId_gameId_key" ON "public"."PlayerGameHistory"("playerId", "gameId");

-- AddForeignKey
ALTER TABLE "public"."PlayerGameHistory" ADD CONSTRAINT "PlayerGameHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
