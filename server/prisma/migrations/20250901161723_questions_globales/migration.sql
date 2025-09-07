/*
  Warnings:

  - You are about to drop the column `choiceId` on the `Answer` table. All the data in the column will be lost.
  - You are about to drop the column `playerId` on the `Answer` table. All the data in the column will be lost.
  - You are about to drop the column `questionId` on the `Answer` table. All the data in the column will be lost.
  - You are about to drop the column `gameId` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `correctId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the `_PlayerToQuestion` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `correct` to the `Answer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `playerGameId` to the `Answer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `text` to the `Answer` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Answer" DROP CONSTRAINT "Answer_playerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Answer" DROP CONSTRAINT "Answer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Player" DROP CONSTRAINT "Player_gameId_fkey";

-- DropForeignKey
ALTER TABLE "public"."_PlayerToQuestion" DROP CONSTRAINT "_PlayerToQuestion_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_PlayerToQuestion" DROP CONSTRAINT "_PlayerToQuestion_B_fkey";

-- DropIndex
DROP INDEX "public"."Answer_playerId_questionId_key";

-- AlterTable
ALTER TABLE "public"."Answer" DROP COLUMN "choiceId",
DROP COLUMN "playerId",
DROP COLUMN "questionId",
ADD COLUMN     "correct" BOOLEAN NOT NULL,
ADD COLUMN     "playerGameId" TEXT NOT NULL,
ADD COLUMN     "text" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Choice" ADD COLUMN     "correct" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Player" DROP COLUMN "gameId",
DROP COLUMN "score";

-- AlterTable
ALTER TABLE "public"."Question" DROP COLUMN "correctId";

-- DropTable
DROP TABLE "public"."_PlayerToQuestion";

-- CreateTable
CREATE TABLE "public"."PlayerGame" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_PlayerGameToQuestion" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PlayerGameToQuestion_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PlayerGameToQuestion_B_index" ON "public"."_PlayerGameToQuestion"("B");

-- AddForeignKey
ALTER TABLE "public"."PlayerGame" ADD CONSTRAINT "PlayerGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerGame" ADD CONSTRAINT "PlayerGame_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Answer" ADD CONSTRAINT "Answer_playerGameId_fkey" FOREIGN KEY ("playerGameId") REFERENCES "public"."PlayerGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PlayerGameToQuestion" ADD CONSTRAINT "_PlayerGameToQuestion_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."PlayerGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PlayerGameToQuestion" ADD CONSTRAINT "_PlayerGameToQuestion_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
