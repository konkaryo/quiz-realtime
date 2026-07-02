-- CreateTable
CREATE TABLE "DailyChallengeBitReward" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "bits" INTEGER NOT NULL,
    "notificationId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallengeBitReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeBitReward_notificationId_key" ON "DailyChallengeBitReward"("notificationId");

-- CreateIndex
CREATE INDEX "DailyChallengeBitReward_playerId_claimedAt_idx" ON "DailyChallengeBitReward"("playerId", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeBitReward_challengeId_playerId_key" ON "DailyChallengeBitReward"("challengeId", "playerId");

-- AddForeignKey
ALTER TABLE "DailyChallengeBitReward" ADD CONSTRAINT "DailyChallengeBitReward_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeBitReward" ADD CONSTRAINT "DailyChallengeBitReward_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
