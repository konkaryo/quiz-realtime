-- CreateTable
CREATE TABLE "public"."DailyChallengeScore" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallengeScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyChallengeScore_challengeId_idx" ON "public"."DailyChallengeScore"("challengeId");

-- CreateIndex
CREATE INDEX "DailyChallengeScore_playerId_idx" ON "public"."DailyChallengeScore"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeScore_challengeId_playerId_key" ON "public"."DailyChallengeScore"("challengeId", "playerId");

-- AddForeignKey
ALTER TABLE "public"."DailyChallengeScore" ADD CONSTRAINT "DailyChallengeScore_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "public"."DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyChallengeScore" ADD CONSTRAINT "DailyChallengeScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
