import { EmailTokenType, Prisma, PrismaClient } from "@prisma/client";
import crypto from "crypto";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

function addMs(date: Date, ms: number) {
  return new Date(date.getTime() + ms);
}

export function generateRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashEmailToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function getTtlByType(type: EmailTokenType) {
  return type === EmailTokenType.EMAIL_VERIFICATION
    ? EMAIL_VERIFICATION_TTL_MS
    : PASSWORD_RESET_TTL_MS;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function createEmailToken(
  prisma: DbClient,
  userId: string,
  type: EmailTokenType
) {
  const rawToken = generateRawToken();
  const tokenHash = hashEmailToken(rawToken);
  const now = new Date();

  await prisma.emailToken.updateMany({
    where: {
      userId,
      type,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });

  await prisma.emailToken.create({
    data: {
      userId,
      type,
      tokenHash,
      expiresAt: addMs(now, getTtlByType(type)),
    },
  });

  return rawToken;
}

export async function findValidEmailToken(
  prisma: DbClient,
  rawToken: string,
  type: EmailTokenType
) {
  const tokenHash = hashEmailToken(rawToken);
  const now = new Date();

  return prisma.emailToken.findFirst({
    where: {
      tokenHash,
      type,
      usedAt: null,
      expiresAt: { gt: now },
    },
  });
}

export async function findEmailToken(
  prisma: DbClient,
  rawToken: string,
  type: EmailTokenType
) {
  const tokenHash = hashEmailToken(rawToken);

  return prisma.emailToken.findFirst({
    where: {
      tokenHash,
      type,
    },
    include: {
      user: {
        select: { id: true, emailVerifiedAt: true },
      },
    },
  });
}

export async function markEmailTokenUsed(prisma: DbClient, id: string) {
  return prisma.emailToken.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}

export async function invalidateActiveEmailTokens(
  prisma: DbClient,
  userId: string,
  type: EmailTokenType
) {
  const now = new Date();
  return prisma.emailToken.updateMany({
    where: {
      userId,
      type,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });
}

export default {
  generateRawToken,
  hashEmailToken,
  createEmailToken,
  findValidEmailToken,
  findEmailToken,
  markEmailTokenUsed,
  invalidateActiveEmailTokens,
};