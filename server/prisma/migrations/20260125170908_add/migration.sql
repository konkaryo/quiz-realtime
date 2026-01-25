-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "guest" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;
