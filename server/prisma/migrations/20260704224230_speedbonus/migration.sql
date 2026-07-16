/*
  Warnings:

  - You are about to drop the `PlayerGameHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PlayerGameHistory" DROP CONSTRAINT "PlayerGameHistory_playerId_fkey";

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "speedBonusEnabled" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "PlayerGameHistory";
