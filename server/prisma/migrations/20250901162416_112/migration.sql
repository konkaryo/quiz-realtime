/*
  Warnings:

  - You are about to drop the column `correct` on the `Choice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Choice" DROP COLUMN "correct",
ADD COLUMN     "isCorrect" BOOLEAN NOT NULL DEFAULT false;
