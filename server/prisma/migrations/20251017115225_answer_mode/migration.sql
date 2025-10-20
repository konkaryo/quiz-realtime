-- CreateEnum
CREATE TYPE "public"."AnswerMode" AS ENUM ('text', 'mc');

-- AlterTable
ALTER TABLE "public"."Answer" ADD COLUMN     "mode" "public"."AnswerMode";
