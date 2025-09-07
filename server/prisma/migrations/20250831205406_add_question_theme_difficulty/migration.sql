/*
  Warnings:

  - A unique constraint covering the columns `[gameId,text]` on the table `Question` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Question" ADD COLUMN     "difficulty" TEXT,
ADD COLUMN     "theme" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Question_gameId_text_key" ON "public"."Question"("gameId", "text");
