-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "difficulty" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "Room_ownerId_idx" ON "public"."Room"("ownerId");

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
