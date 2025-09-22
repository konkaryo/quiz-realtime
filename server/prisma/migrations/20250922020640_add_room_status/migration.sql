-- CreateEnum
CREATE TYPE "public"."RoomStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "status" "public"."RoomStatus" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "Room_status_createdAt_idx" ON "public"."Room"("status", "createdAt");
