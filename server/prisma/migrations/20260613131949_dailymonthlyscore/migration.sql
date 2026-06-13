-- CreateTable
CREATE TABLE "DailyChallengeMonthlyScore" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "challengesPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallengeMonthlyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyChallengeMonthlyScore_year_month_totalScore_idx" ON "DailyChallengeMonthlyScore"("year", "month", "totalScore");

-- CreateIndex
CREATE INDEX "DailyChallengeMonthlyScore_playerId_idx" ON "DailyChallengeMonthlyScore"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeMonthlyScore_playerId_year_month_key" ON "DailyChallengeMonthlyScore"("playerId", "year", "month");

-- AddForeignKey
ALTER TABLE "DailyChallengeMonthlyScore" ADD CONSTRAINT "DailyChallengeMonthlyScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
