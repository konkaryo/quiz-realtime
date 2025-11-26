-- CreateTable
CREATE TABLE "public"."DailyChallenge" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyChallengeQuestion" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallengeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallenge_date_key" ON "public"."DailyChallenge"("date");

-- CreateIndex
CREATE INDEX "DailyChallengeQuestion_questionId_idx" ON "public"."DailyChallengeQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeQuestion_challengeId_position_key" ON "public"."DailyChallengeQuestion"("challengeId", "position");

-- AddForeignKey
ALTER TABLE "public"."DailyChallengeQuestion" ADD CONSTRAINT "DailyChallengeQuestion_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "public"."DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyChallengeQuestion" ADD CONSTRAINT "DailyChallengeQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
