-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'MODERATOR', 'USER');

-- CreateEnum
CREATE TYPE "public"."RoomStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."AnswerMode" AS ENUM ('text', 'mc');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('INVITATION', 'MESSAGE', 'REWARD', 'INFO');

-- CreateEnum
CREATE TYPE "public"."Theme" AS ENUM ('ARTS', 'AUDIOVISUEL', 'CROYANCES', 'DIVERS', 'GEOGRAPHIE', 'HISTOIRE', 'LITTERATURE', 'MUSIQUE', 'NATURE', 'POP_CULTURE', 'SCIENCE', 'SOCIETE', 'SPORT', 'TRADITIONS');

-- CreateEnum
CREATE TYPE "public"."RoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."QuestionReportReason" AS ENUM ('ANSWER_INCORRECT_OR_MISSING', 'SPELLING_ERRORS', 'IMAGE_ISSUE', 'UNINTERESTING_QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."EmailTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'USER',
    "guest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."EmailTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Player" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "img" TEXT NOT NULL DEFAULT '0',
    "bits" INTEGER NOT NULL DEFAULT 0,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlayerGameHistory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerGameId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "finalRank" INTEGER NOT NULL,
    "totalPlayers" INTEGER NOT NULL,
    "finalScore" INTEGER NOT NULL,
    "gameDifficulty" INTEGER NOT NULL,
    "questionResults" JSONB NOT NULL,
    "xpGained" INTEGER NOT NULL DEFAULT 0,
    "bitsGained" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerGameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "public"."NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Bot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speed" INTEGER NOT NULL DEFAULT 50,
    "regularity" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "averageSkill" INTEGER NOT NULL DEFAULT 50,
    "morning" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "afternoon" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "evening" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "night" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
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

-- CreateTable
CREATE TABLE "public"."Room" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "ownerId" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 50,
    "popularity" INTEGER NOT NULL DEFAULT 5,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."RoomStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "bannedThemes" "public"."Theme"[],
    "questionCount" INTEGER NOT NULL DEFAULT 10,
    "roundMs" INTEGER NOT NULL DEFAULT 10000,
    "visibility" "public"."RoomVisibility" NOT NULL DEFAULT 'PRIVATE',
    "image" TEXT,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Game" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "theme" "public"."Theme",
    "difficulty" TEXT,
    "img" TEXT,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlayerGame" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Choice" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "questionId" TEXT NOT NULL,

    CONSTRAINT "Choice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Answer" (
    "id" TEXT NOT NULL,
    "playerGameId" TEXT NOT NULL,
    "questionId" TEXT,
    "text" TEXT NOT NULL,
    "mode" "public"."AnswerMode",
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseMs" INTEGER NOT NULL DEFAULT -1,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AcceptedAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "norm" TEXT NOT NULL,

    CONSTRAINT "AcceptedAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyChallenge" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyChallengeQuestion" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallengeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyChallengeScore" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallengeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuestionReport" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "reason" "public"."QuestionReportReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_PlayerGameToQuestion" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PlayerGameToQuestion_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "public"."EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_type_idx" ON "public"."EmailToken"("userId", "type");

-- CreateIndex
CREATE INDEX "EmailToken_expiresAt_idx" ON "public"."EmailToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "public"."Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "public"."Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "public"."Player"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameHistory_playerGameId_key" ON "public"."PlayerGameHistory"("playerGameId");

-- CreateIndex
CREATE INDEX "PlayerGameHistory_playerId_playedAt_idx" ON "public"."PlayerGameHistory"("playerId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameHistory_playerId_gameId_key" ON "public"."PlayerGameHistory"("playerId", "gameId");

-- CreateIndex
CREATE INDEX "Notification_playerId_read_issuedAt_idx" ON "public"."Notification"("playerId", "read", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_name_key" ON "public"."Bot"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_playerId_key" ON "public"."Bot"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "public"."Room"("code");

-- CreateIndex
CREATE INDEX "Room_ownerId_idx" ON "public"."Room"("ownerId");

-- CreateIndex
CREATE INDEX "Room_status_createdAt_idx" ON "public"."Room"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGame_gameId_playerId_key" ON "public"."PlayerGame"("gameId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptedAnswer_questionId_norm_key" ON "public"."AcceptedAnswer"("questionId", "norm");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallenge_date_key" ON "public"."DailyChallenge"("date");

-- CreateIndex
CREATE INDEX "DailyChallengeQuestion_questionId_idx" ON "public"."DailyChallengeQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeQuestion_challengeId_position_key" ON "public"."DailyChallengeQuestion"("challengeId", "position");

-- CreateIndex
CREATE INDEX "DailyChallengeScore_challengeId_idx" ON "public"."DailyChallengeScore"("challengeId");

-- CreateIndex
CREATE INDEX "DailyChallengeScore_playerId_idx" ON "public"."DailyChallengeScore"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeScore_challengeId_playerId_key" ON "public"."DailyChallengeScore"("challengeId", "playerId");

-- CreateIndex
CREATE INDEX "QuestionReport_questionId_idx" ON "public"."QuestionReport"("questionId");

-- CreateIndex
CREATE INDEX "QuestionReport_playerId_idx" ON "public"."QuestionReport"("playerId");

-- CreateIndex
CREATE INDEX "QuestionReport_createdAt_idx" ON "public"."QuestionReport"("createdAt");

-- CreateIndex
CREATE INDEX "_PlayerGameToQuestion_B_index" ON "public"."_PlayerGameToQuestion"("B");

-- AddForeignKey
ALTER TABLE "public"."EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerGameHistory" ADD CONSTRAINT "PlayerGameHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bot" ADD CONSTRAINT "Bot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BotSkill" ADD CONSTRAINT "BotSkill_botId_fkey" FOREIGN KEY ("botId") REFERENCES "public"."Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Game" ADD CONSTRAINT "Game_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerGame" ADD CONSTRAINT "PlayerGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerGame" ADD CONSTRAINT "PlayerGame_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Choice" ADD CONSTRAINT "Choice_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Answer" ADD CONSTRAINT "Answer_playerGameId_fkey" FOREIGN KEY ("playerGameId") REFERENCES "public"."PlayerGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AcceptedAnswer" ADD CONSTRAINT "AcceptedAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyChallengeQuestion" ADD CONSTRAINT "DailyChallengeQuestion_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "public"."DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyChallengeQuestion" ADD CONSTRAINT "DailyChallengeQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyChallengeScore" ADD CONSTRAINT "DailyChallengeScore_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "public"."DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyChallengeScore" ADD CONSTRAINT "DailyChallengeScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuestionReport" ADD CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuestionReport" ADD CONSTRAINT "QuestionReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PlayerGameToQuestion" ADD CONSTRAINT "_PlayerGameToQuestion_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."PlayerGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_PlayerGameToQuestion" ADD CONSTRAINT "_PlayerGameToQuestion_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom SQL objects (functions, triggers, views, extensions)

-- Create room id generator function ensuring mixed digits and letters (excluding i, l, o)
CREATE OR REPLACE FUNCTION random_room_id()
RETURNS text AS $$
DECLARE
  alpha TEXT[] := ARRAY['a','b','c','d','e','f','g','h','j','k','m','n','p','q','r','s','t','u','v','w','x','y','z'];
  digits TEXT[] := ARRAY['0','1','2','3','4','5','6','7','8','9'];
  result TEXT := '';
  pick TEXT;
  idx INT;
BEGIN
  FOR i IN 0..15 LOOP
    IF random() < 0.5 THEN
      idx := floor(random() * array_length(digits, 1))::INT + 1;
      pick := digits[idx];
    ELSE
      idx := floor(random() * array_length(alpha, 1))::INT + 1;
      pick := alpha[idx];
    END IF;

    result := result || pick;

    IF (i + 1) % 4 = 0 AND i < 15 THEN
      result := result || '-';
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Create player id generator function with digits and lowercase letters
CREATE OR REPLACE FUNCTION random_player_id()
RETURNS text AS $$
DECLARE
  alpha TEXT[] := ARRAY['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
  digits TEXT[] := ARRAY['0','1','2','3','4','5','6','7','8','9'];
  result TEXT := '';
  pick TEXT;
  idx INT;
BEGIN
  FOR i IN 0..15 LOOP
    IF random() < 0.5 THEN
      idx := floor(random() * array_length(digits, 1))::INT + 1;
      pick := digits[idx];
    ELSE
      idx := floor(random() * array_length(alpha, 1))::INT + 1;
      pick := alpha[idx];
    END IF;

    result := result || pick;

    IF (i + 1) % 4 = 0 AND i < 15 THEN
      result := result || '-';
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Apply as defaults for Prisma dbgenerated() ids
ALTER TABLE "public"."Room" ALTER COLUMN "id" SET DEFAULT random_room_id();
ALTER TABLE "public"."Player" ALTER COLUMN "id" SET DEFAULT random_player_id();