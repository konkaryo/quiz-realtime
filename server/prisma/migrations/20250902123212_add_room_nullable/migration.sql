/*
  Warnings:

  - You are about to drop the column `code` on the `Game` table. All the data in the column will be lost.
  - Added the required column `roomId` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Game_code_key";

-- AlterTable
ALTER TABLE "public"."Game" DROP COLUMN "code",
ADD COLUMN     "roomId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "public"."Room"("code");

-- AddForeignKey
ALTER TABLE "public"."Game" ADD CONSTRAINT "Game_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
