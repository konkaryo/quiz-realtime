-- CreateEnum
CREATE TYPE "public"."RoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "visibility" "public"."RoomVisibility" NOT NULL DEFAULT 'PRIVATE';
