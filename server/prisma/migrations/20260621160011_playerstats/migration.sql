-- CreateTable
CREATE TABLE "PlayerStats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "easyQuestions" INTEGER NOT NULL DEFAULT 0,
    "moderateQuestions" INTEGER NOT NULL DEFAULT 0,
    "difficultQuestions" INTEGER NOT NULL DEFAULT 0,
    "extremeQuestions" INTEGER NOT NULL DEFAULT 0,
    "themeStats" JSONB NOT NULL DEFAULT '{}',
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStats_playerId_key" ON "PlayerStats"("playerId");

-- CreateIndex
CREATE INDEX "PlayerStats_lastUpdatedAt_idx" ON "PlayerStats"("lastUpdatedAt");

-- AddForeignKey
ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
