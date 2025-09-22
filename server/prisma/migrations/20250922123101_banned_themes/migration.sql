/*
  Warnings:

  - The `theme` column on the `Question` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."Theme" AS ENUM ('CINEMA_SERIES', 'ARTS_CULTURE', 'JEUX_BD', 'GEOGRAPHIE', 'LITTERATURE', 'ECONOMIE_POLITIQUE', 'GASTRONOMIE', 'CROYANCES', 'SPORT', 'HISTOIRE', 'DIVERS', 'SCIENCES_VIE', 'SCIENCES_EXACTES', 'MUSIQUE', 'ACTUALITES_MEDIAS', 'TECHNOLOGIE');

-- AlterTable
ALTER TABLE "public"."Question" DROP COLUMN "theme",
ADD COLUMN     "theme" "public"."Theme";

-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "bannedThemes" "public"."Theme"[];
