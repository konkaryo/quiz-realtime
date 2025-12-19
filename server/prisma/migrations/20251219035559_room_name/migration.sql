-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "name" TEXT;

-- CreateTable
CREATE TABLE "public"."RoomName" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomName_name_key" ON "public"."RoomName"("name");
