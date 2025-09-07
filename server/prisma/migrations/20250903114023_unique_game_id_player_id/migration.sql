/*
  Warnings:

  - A unique constraint covering the columns `[gameId,playerId]` on the table `PlayerGame` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PlayerGame_gameId_playerId_key" ON "public"."PlayerGame"("gameId", "playerId");
