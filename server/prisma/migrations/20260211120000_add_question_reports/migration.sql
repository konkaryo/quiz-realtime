-- CreateEnum
CREATE TYPE "QuestionReportReason" AS ENUM (
  'ANSWER_INCORRECT_OR_MISSING',
  'SPELLING_ERRORS',
  'IMAGE_ISSUE',
  'UNINTERESTING_QUESTION',
  'OTHER'
);

-- CreateTable
CREATE TABLE "QuestionReport" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "reason" "QuestionReportReason" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionReport_questionId_idx" ON "QuestionReport"("questionId");

-- CreateIndex
CREATE INDEX "QuestionReport_playerId_idx" ON "QuestionReport"("playerId");

-- CreateIndex
CREATE INDEX "QuestionReport_createdAt_idx" ON "QuestionReport"("createdAt");

-- AddForeignKey
ALTER TABLE "QuestionReport"
  ADD CONSTRAINT "QuestionReport_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport"
  ADD CONSTRAINT "QuestionReport_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;