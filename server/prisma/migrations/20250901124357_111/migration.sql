/*
  Warnings:

  - You are about to drop the column `gameId` on the `Answer` table. All the data in the column will be lost.
  - You are about to drop the column `gameId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `order` on the `Question` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Answer" DROP CONSTRAINT "Answer_gameId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Question" DROP CONSTRAINT "Question_gameId_fkey";

-- DropIndex
DROP INDEX "public"."Question_gameId_text_key";

-- AlterTable
ALTER TABLE "public"."Answer" DROP COLUMN "gameId";

-- AlterTable
ALTER TABLE "public"."Question" DROP COLUMN "gameId",
DROP COLUMN "order",
ADD COLUMN     "img" TEXT;

-- CreateTable
CREATE TABLE "public"."_PlayerToQuestion" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PlayerToQuestion_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PlayerToQuestion_B_index" ON "public"."_PlayerToQuestion"("B");

-- AddForeignKey
ALTER TABLE "public"."_PlayerToQuestion" ADD CONSTRAINT "_PlayerToQuestion_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PlayerToQuestion" ADD CONSTRAINT "_PlayerToQuestion_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
