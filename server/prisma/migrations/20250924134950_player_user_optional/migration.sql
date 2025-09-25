-- DropForeignKey
ALTER TABLE "public"."Player" DROP CONSTRAINT "Player_userId_fkey";

-- AlterTable
ALTER TABLE "public"."Player" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
