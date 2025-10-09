/*
  Warnings:

  - The values [LITTERATURE,SCIENCES_EXACTES,TECHNOLOGIE] on the enum `Theme` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."Theme_new" AS ENUM ('CINEMA_SERIES', 'ARTS_CULTURE', 'JEUX_BD', 'GEOGRAPHIE', 'LANGUES_LITTERATURE', 'ECONOMIE_POLITIQUE', 'GASTRONOMIE', 'CROYANCES', 'SPORT', 'HISTOIRE', 'DIVERS', 'SCIENCES_VIE', 'SCIENCES_TECHNIQUES', 'MUSIQUE', 'ACTUALITES_MEDIAS');
ALTER TABLE "public"."BotSkill" ALTER COLUMN "theme" TYPE "public"."Theme_new" USING ("theme"::text::"public"."Theme_new");
ALTER TABLE "public"."Room" ALTER COLUMN "bannedThemes" TYPE "public"."Theme_new"[] USING ("bannedThemes"::text::"public"."Theme_new"[]);
ALTER TABLE "public"."Question" ALTER COLUMN "theme" TYPE "public"."Theme_new" USING ("theme"::text::"public"."Theme_new");
ALTER TYPE "public"."Theme" RENAME TO "Theme_old";
ALTER TYPE "public"."Theme_new" RENAME TO "Theme";
DROP TYPE "public"."Theme_old";
COMMIT;
