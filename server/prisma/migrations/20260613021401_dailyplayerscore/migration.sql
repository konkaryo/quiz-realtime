-- CreateTable
CREATE TABLE "DailyChallengeQuestionResult" (
    "id" TEXT NOT NULL,
    "scoreId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseMs" INTEGER NOT NULL DEFAULT -1,
    "points" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL,
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallengeQuestionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyChallengeQuestionResult_entryId_idx" ON "DailyChallengeQuestionResult"("entryId");

-- CreateIndex
CREATE INDEX "DailyChallengeQuestionResult_playerId_idx" ON "DailyChallengeQuestionResult"("playerId");

-- CreateIndex
CREATE INDEX "DailyChallengeQuestionResult_questionId_idx" ON "DailyChallengeQuestionResult"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeQuestionResult_scoreId_entryId_key" ON "DailyChallengeQuestionResult"("scoreId", "entryId");

-- AddForeignKey
ALTER TABLE "DailyChallengeQuestionResult" ADD CONSTRAINT "DailyChallengeQuestionResult_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "DailyChallengeScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeQuestionResult" ADD CONSTRAINT "DailyChallengeQuestionResult_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DailyChallengeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeQuestionResult" ADD CONSTRAINT "DailyChallengeQuestionResult_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeQuestionResult" ADD CONSTRAINT "DailyChallengeQuestionResult_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
