// src/routes/auth.ts
import type { FastifyPluginAsync } from "fastify";
import { EmailTokenType, NotificationType, Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";
import sharp from "sharp";
import {
  hashPassword,
  verifyPassword,
  clearAuthCookie,
  currentUser,
  maybeRefreshSession,
  revokeSession,
  createSession,
  setAuthCookie,
} from "../auth";
import { toProfileUrl } from "../domain/media/media.service";
import { CFG } from "../config";
import { sendEmailChangeVerificationEmail, sendResetPasswordEmail, sendVerificationEmail } from "../infra/email";
import emailTokenService from "../domain/auth/email-token.service";
import { refreshPlayerStats } from "../domain/player/player-stats.service";
import { moderateProfileImage } from "../domain/media/avatar-moderation.service";

type Opts = { prisma: PrismaClient };

const normEmail = (e: string) => e.trim().toLowerCase();
const cleanName  = (s: string) => s.trim().slice(0, 64);
const GUEST_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function genGuestDisplayName() {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += GUEST_CHARS[crypto.randomInt(0, GUEST_CHARS.length)];
  }
  return `invite-${suffix}`;
}

const AVATAR_MIME_TO_EXT: Record<string, string> = {
  "image/avif": "avif",
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_DATA_URL_MAX_LENGTH = Math.ceil(AVATAR_MAX_BYTES * 4 / 3) + 128;
const AVATAR_REQUEST_MAX_BYTES = AVATAR_DATA_URL_MAX_LENGTH + 1024;
const AVATAR_SIZE_PX = 512;

function parseAvatarDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const base64 = match[2];
  return { mime, buffer: Buffer.from(base64, "base64") };
}

async function normalizeAvatar(buffer: Buffer, declaredMime: string) {
  if (buffer.length === 0 || buffer.length > AVATAR_MAX_BYTES) return null;

  const image = sharp(buffer, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  });
  const metadata = await image.metadata();
  const decodedMime = metadata.format === "jpg" ? "image/jpeg" : `image/${metadata.format}`;
  const normalizedDeclaredMime = declaredMime === "image/jpg" ? "image/jpeg" : declaredMime;

  if (!metadata.width || !metadata.height || !(decodedMime in AVATAR_MIME_TO_EXT)) return null;
  if (decodedMime !== normalizedDeclaredMime) return null;

  return image
    .rotate()
    .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "cover", position: "centre" })
    .webp({ quality: 85 })
    .toBuffer();
}

export const authRoutes = ({ prisma }: Opts): FastifyPluginAsync =>
  async (app) => {
    // POST /auth/register
    app.post("/register", async (req, reply) => {
      const body = (req.body ?? {}) as {
        email?: string;
        password?: string;
        displayName?: string;
        name?: string;
        username?: string;
      };
      const email = normEmail(body.email || "");
      const password = (body.password || "").trim();
      const displayName = cleanName(
        body.displayName || body.name || body.username || email.split("@")[0]
      );

      if (!email || !password) return reply.code(400).send({ error: "missing-fields" });
      if (password.length < 8)   return reply.code(400).send({ error: "weak-password" });

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        if (exists.emailVerifiedAt) {
          return reply.code(409).send({ error: "email-taken" });
        }

        // A previous provider failure may have left an unverified account in
        // the database. Re-issuing its token lets the user retry registration
        // without modifying the password or profile already stored.
        const verificationToken = await emailTokenService.createEmailToken(
          prisma,
          exists.id,
          EmailTokenType.EMAIL_VERIFICATION
        );
        await sendVerificationEmail(email, verificationToken);

        return reply.code(201).send({
          ok: true,
          message: "verification-email-sent",
        });
      }

      const passwordHash = await hashPassword(password);

      // Crée User + Player lié (pas de cas legacy ici)
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          player: { create: { name: displayName } },
          emailVerifiedAt: null,
        },
        include: { player: true },
      });

      if (user.player?.id) {
        await prisma.notification.create({
          data: {
            playerId: user.player.id,
            type: NotificationType.INFO,
            message: "Bienvenue sur Synapz ! 🎉",
          },
        });
      }

      const verificationToken = await emailTokenService.createEmailToken(
        prisma,
        user.id,
        EmailTokenType.EMAIL_VERIFICATION
      );
      await sendVerificationEmail(email, verificationToken);

      return reply.code(201).send({
        ok: true,
        message: "verification-email-sent",
      });
    });

    // GET /auth/verify-email?token=...
    app.get("/verify-email", async (req, reply) => {
      const token = String((req.query as { token?: string } | undefined)?.token ?? "").trim();
      if (!token) return reply.code(400).send({ error: "invalid-token" });

      const emailToken = await emailTokenService.findEmailToken(prisma, token, EmailTokenType.EMAIL_VERIFICATION)
        ?? await emailTokenService.findEmailToken(prisma, token, EmailTokenType.EMAIL_CHANGE);
      if (!emailToken) return reply.code(400).send({ error: "invalid-token" });

      const now = new Date();
      const isUnused = !emailToken.usedAt;
      const isExpired = emailToken.expiresAt <= now;

      if (isUnused && isExpired) {
        return reply.code(400).send({ error: "invalid-token" });
      }

      const isEmailChange = emailToken.type === EmailTokenType.EMAIL_CHANGE;

      // Confirmation links are idempotent once this exact address has been
      // applied. This also tolerates duplicate requests from a page reload or
      // React Strict Mode without accepting tokens invalidated by a newer request.
      const isCompletedEmailChange = isEmailChange
        && !isUnused
        && Boolean(emailToken.pendingEmail)
        && normEmail(emailToken.user.email ?? "") === normEmail(emailToken.pendingEmail ?? "");

      if (!isUnused && !isCompletedEmailChange && (isEmailChange || !emailToken.user.emailVerifiedAt)) {
        return reply.code(400).send({ error: "invalid-token" });
      }

      if (isUnused) {
        if (isEmailChange && !emailToken.pendingEmail) {
          return reply.code(400).send({ error: "invalid-token" });
        }

        try {
          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: emailToken.userId },
              data: isEmailChange
                ? { email: emailToken.pendingEmail, emailVerifiedAt: now }
                : { emailVerifiedAt: now },
            });
            await emailTokenService.markEmailTokenUsed(tx, emailToken.id);
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return reply.code(409).send({ error: "email-taken" });
          }
          throw error;
        }
      }

      const { token: sessionToken, session } = await createSession(prisma, emailToken.userId);
      setAuthCookie(reply, sessionToken);

      return reply.send({
        ok: true,
        message: "email-verified",
        session: { expiresAt: session.expiresAt },
      });
    });

    // POST /auth/forgot-password
    app.post("/forgot-password", async (req, reply) => {
      const Body = z.object({ email: z.string().email() });
      const parsed = Body.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.send({
          ok: true,
          message: "If an account exists for this email, a reset link has been sent.",
        });
      }

      const email = normEmail(parsed.data.email);
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      });

      if (user?.email) {
        const resetToken = await emailTokenService.createEmailToken(
          prisma,
          user.id,
          EmailTokenType.PASSWORD_RESET
        );
        await sendResetPasswordEmail(user.email, resetToken);
      }

      return reply.send({
        ok: true,
        message: "If an account exists for this email, a reset link has been sent.",
      });
    });

    // POST /auth/reset-password
    app.post("/reset-password", async (req, reply) => {
      const Body = z.object({
        token: z.string().min(1),
        newPassword: z.string().min(8),
      });
      const parsed = Body.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_payload" });
      }

      const { token, newPassword } = parsed.data;
      const emailToken = await emailTokenService.findValidEmailToken(prisma, token, EmailTokenType.PASSWORD_RESET);
      if (!emailToken) return reply.code(400).send({ error: "invalid-token" });

      const passwordHash = await hashPassword(newPassword);

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: emailToken.userId },
          data: { passwordHash },
        });
        await emailTokenService.markEmailTokenUsed(tx, emailToken.id);
        await emailTokenService.invalidateActiveEmailTokens(tx, emailToken.userId, EmailTokenType.PASSWORD_RESET);
      });

      return reply.send({ ok: true, message: "password-reset-success" });
    });

    // POST /auth/login
    app.post("/login", async (req, reply) => {
      const body = (req.body ?? {}) as { email?: string; password?: string };
      const email = normEmail(body.email || "");
      const password = (body.password || "").trim();

      if (!email || !password) return reply.code(400).send({ error: "missing-fields" });

      const user = await prisma.user.findUnique({
        where: { email },
        include: { player: { select: { id: true, name: true, img: true, bits: true, experience: true } } }
      });
      if (!user) return reply.code(401).send({ error: "invalid-credentials" });

      if (!user.passwordHash) return reply.code(401).send({ error: "invalid-credentials" });
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) return reply.code(401).send({ error: "invalid-credentials" });
      if (!user.emailVerifiedAt) return reply.code(403).send({ error: "email-not-verified" });

      const { token, session } = await createSession(prisma, user.id);
      setAuthCookie(reply, token);

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          guest: user.guest,
          role: user.role,
          playerId: user.player?.id ?? null,
          playerName: user.player?.name ?? null,
          img: toProfileUrl(user.player?.img ?? null),
          bits: user.player?.bits ?? 0,
          experience: user.player?.experience ?? 0,
        },
        session: { expiresAt: session.expiresAt },
      });
    });

    // POST /auth/logout
    app.post("/logout", async (req, reply) => {
      const token = (req.cookies || {})["sid"] as string | undefined;
      if (token) await revokeSession(prisma, token);
      clearAuthCookie(reply);
      return reply.send({ ok: true });
    });

    // GET /auth/me
    app.get("/me", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) {
        const displayName = genGuestDisplayName();
        const guestUser = await prisma.user.create({
          data: {
            email: null,
            passwordHash: null,
            displayName,
            guest: true,
            player: { create: { name: displayName } },
          },
        });

        const { token } = await createSession(prisma, guestUser.id);
        setAuthCookie(reply, token);

        const guestPlayer = await prisma.player.findUnique({
          where: { userId: guestUser.id },
          select: { id: true, name: true, img: true, bits: true, experience: true },
        });

        return reply.send({
          user: {
            id: guestUser.id,
            email: guestUser.email,
            displayName: guestUser.displayName,
            guest: guestUser.guest,
            role: guestUser.role,
            playerId: guestPlayer?.id ?? null,
            playerName: guestPlayer?.name ?? null,
            img: toProfileUrl(guestPlayer?.img ?? null),
            bits: guestPlayer?.bits ?? 0,
            experience: guestPlayer?.experience ?? 0,
          },
        });
      }

      await maybeRefreshSession(prisma, session); // sliding expiration (optionnel)

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true, name: true, img: true, bits: true, experience: true },
      });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          guest: user.guest,
          role: user.role,
          playerId: player?.id ?? null,
          playerName: player?.name ?? null,
          img: toProfileUrl(player?.img ?? null),
          bits: player?.bits ?? 0,
          experience: player?.experience ?? 0,
        },
      });
    });

    // POST /auth/me/avatar
    app.post("/me/avatar", { bodyLimit: AVATAR_REQUEST_MAX_BYTES }, async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });
      if (user.guest) return reply.code(403).send({ error: "guest-account" });

      const Body = z.object({
        dataUrl: z.string().min(1).max(AVATAR_DATA_URL_MAX_LENGTH),
        filename: z.string().max(255).optional(),
      });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });

      const parsedData = parseAvatarDataUrl(parsed.data.dataUrl);
      if (!parsedData) return reply.code(400).send({ error: "invalid_image" });

      if (!AVATAR_MIME_TO_EXT[parsedData.mime]) {
        return reply.code(400).send({ error: "unsupported_image_type" });
      }

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true, img: true },
      });
      if (!player) return reply.code(404).send({ error: "player_not_found" });

      let normalizedImage: Buffer;
      try {
        const normalized = await normalizeAvatar(parsedData.buffer, parsedData.mime);
        if (!normalized) return reply.code(400).send({ error: "invalid_image" });
        normalizedImage = normalized;
      } catch {
        return reply.code(400).send({ error: "invalid_image" });
      }

      try {
        const flagged = await moderateProfileImage(normalizedImage, "image/webp");
        if (flagged) {
          req.log.info({ userId: user.id }, "Profile image moderation rejected an image");
          return reply.code(422).send({ error: "avatar_moderation_rejected" });
        }
        req.log.info({ userId: user.id }, "Profile image moderation succeeded");
      } catch {
        req.log.error({ userId: user.id }, "Profile image moderation failed");
        return reply.code(503).send({ error: "avatar_moderation_unavailable" });
      }

      const profilesDir = path.resolve(CFG.IMG_DIR, "profiles");
      await fs.mkdir(profilesDir, { recursive: true });

      const fileName = `${player.id}.webp`;
      const filePath = path.join(profilesDir, fileName);
      await fs.writeFile(filePath, normalizedImage);

      let updatedImg = player.img ?? null;
      if (player.img !== fileName) {
        const updated = await prisma.player.update({
          where: { id: player.id },
          data: { img: fileName },
          select: { img: true },
        });
        updatedImg = updated.img ?? null;
      }

      return reply.send({
        img: toProfileUrl(updatedImg ?? fileName),
        storedAs: fileName,
      });
    });

    // PATCH /auth/me/account
    app.patch("/me/account", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });
      if (user.guest) return reply.code(403).send({ error: "guest-account" });

      const Body = z.object({
        email: z.string().email(),
        playerName: z.string().trim().min(1).max(64),
      });
      const parsed = Body.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });

      const email = normEmail(parsed.data.email);
      const playerName = cleanName(parsed.data.playerName);
      const emailChanged = email !== normEmail(user.email ?? "");

      if (emailChanged) {
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existing && existing.id !== user.id) {
          return reply.code(409).send({ error: "email-taken" });
        }

        const verificationToken = await emailTokenService.createEmailChangeToken(prisma, user.id, email);
        try {
          await sendEmailChangeVerificationEmail(email, verificationToken);
        } catch (error) {
          req.log.error({ err: error }, "Unable to send email-change verification email");
          return reply.code(503).send({ error: "verification-email-unavailable" });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            displayName: playerName,
          },
          select: {
            id: true,
            email: true,
            displayName: true,
            guest: true,
            role: true,
          },
        });

        const updatedPlayer = await tx.player.update({
          where: { userId: user.id },
          data: { name: playerName },
          select: { id: true, name: true, img: true, bits: true, experience: true },
        });

        return { updatedUser, updatedPlayer };
      });

      return reply.send({
        ok: true,
        emailVerificationSent: emailChanged,
        pendingEmail: emailChanged ? email : null,
        user: {
          id: updated.updatedUser.id,
          email: updated.updatedUser.email,
          displayName: updated.updatedUser.displayName,
          guest: updated.updatedUser.guest,
          role: updated.updatedUser.role,
          playerId: updated.updatedPlayer.id,
          playerName: updated.updatedPlayer.name,
          img: toProfileUrl(updated.updatedPlayer.img ?? null),
          bits: updated.updatedPlayer.bits ?? 0,
          experience: updated.updatedPlayer.experience ?? 0,
        },
      });
    });

    // POST /auth/me/password
    app.post("/me/password", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });
      if (user.guest) return reply.code(403).send({ error: "guest-account" });

      const Body = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      });
      const parsed = Body.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });

      if (!user.passwordHash) return reply.code(400).send({ error: "missing-password" });

      const passwordOk = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
      if (!passwordOk) return reply.code(401).send({ error: "invalid-current-password" });

      const passwordHash = await hashPassword(parsed.data.newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      return reply.send({ ok: true });
    });


    // GET /auth/me/stats
    app.get("/me/stats", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ stats: {} });

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!player) return reply.send({ stats: {}, totalQuestions: 0 });

      const [playerStats, avgTextResponse] = await Promise.all([
        refreshPlayerStats(prisma, player.id),
        prisma.answer.aggregate({
          where: {
            playerGame: { playerId: player.id },
            mode: "text",
            correct: true,
            responseMs: { gte: 0 },
          },
          _avg: { responseMs: true },
        }),
      ]);

      return reply.send({
        ...playerStats,
        avgTextResponseMs: avgTextResponse._avg.responseMs ?? null,
      });
    });

  };

