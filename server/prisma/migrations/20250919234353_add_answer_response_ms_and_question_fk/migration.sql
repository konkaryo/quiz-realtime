-- AlterTable
ALTER TABLE "public"."Answer" ADD COLUMN     "questionId" TEXT,
ADD COLUMN     "responseMs" INTEGER NOT NULL DEFAULT -1;

-- AddForeignKey
ALTER TABLE "public"."Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
