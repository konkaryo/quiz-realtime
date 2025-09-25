-- AlterTable
ALTER TABLE "public"."Player" ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."Bot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speed" INTEGER NOT NULL,
    "playerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BotSkill" (
    "botId" TEXT NOT NULL,
    "theme" "public"."Theme" NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "BotSkill_pkey" PRIMARY KEY ("botId","theme")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bot_name_key" ON "public"."Bot"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_playerId_key" ON "public"."Bot"("playerId");

-- AddForeignKey
ALTER TABLE "public"."Bot" ADD CONSTRAINT "Bot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BotSkill" ADD CONSTRAINT "BotSkill_botId_fkey" FOREIGN KEY ("botId") REFERENCES "public"."Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
