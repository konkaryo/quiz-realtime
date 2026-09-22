import { createHash } from "crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Socket } from "socket.io";

export type RateLimitRule = { name: string; max: number; windowMs: number };

type Entry = { count: number; resetAt: number };

/**
 * A deliberately small, bounded, in-process fixed-window store. Synapz currently
 * runs one backend process. Counters reset on restart and must be replaced by a
 * shared store before running several backend replicas.
 */
export class MemoryRateLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly maxEntries = 100_000) {}

  consume(rule: RateLimitRule, key: string, now = Date.now()) {
    const storageKey = `${rule.name}:${key}`;
    const current = this.entries.get(storageKey);
    if (!current || current.resetAt <= now) {
      if (!current && this.entries.size >= this.maxEntries) {
        this.sweep(now);
        if (this.entries.size >= this.maxEntries) {
          return { allowed: false, remaining: 0, resetAt: now + Math.min(rule.windowMs, 60_000) };
        }
      }
      const entry = { count: 1, resetAt: now + rule.windowMs };
      this.entries.set(storageKey, entry);
      return { allowed: true, remaining: Math.max(0, rule.max - 1), resetAt: entry.resetAt };
    }
    current.count += 1;
    return {
      allowed: current.count <= rule.max,
      remaining: Math.max(0, rule.max - current.count),
      resetAt: current.resetAt,
    };
  }

  clear() { this.entries.clear(); }

  get size() { return this.entries.size; }

  sweep(now = Date.now()) {
    for (const [key, value] of this.entries) if (value.resetAt <= now) this.entries.delete(key);
  }
}

export const rateLimiter = new MemoryRateLimiter();

/** Collapse IPv6 clients to a /64, the normal end-user allocation boundary. */
export function normalizeClientIp(input: string) {
  const ip = input.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!ip.includes(":")) return ip;
  if (ip.startsWith("::ffff:") && /^::ffff:\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.slice(7);
  const [leftRaw, rightRaw = ""] = ip.split("::", 2);
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  const expanded = ip.includes("::")
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  if (expanded.length !== 8 || expanded.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return ip;
  return `${expanded.slice(0, 4).map((part) => Number.parseInt(part, 16).toString(16)).join(":")}::/64`;
}

export const requestIpKey = (req: FastifyRequest) => normalizeClientIp(req.ip);

export const HTTP_LIMITS = {
  global: { name: "http-global-ip", max: 300, windowMs: 60_000 },
  loginIp: { name: "login-ip", max: 30, windowMs: 15 * 60_000 },
  loginIpEmail: { name: "login-ip-email", max: 8, windowMs: 15 * 60_000 },
  loginEmail: { name: "login-email", max: 30, windowMs: 60 * 60_000 },
  registerIp: { name: "register-ip", max: 5, windowMs: 60 * 60_000 },
  registerEmail: { name: "register-email", max: 3, windowMs: 60 * 60_000 },
  forgotIp: { name: "forgot-password-ip", max: 10, windowMs: 60 * 60_000 },
  forgotEmail: { name: "forgot-password-email", max: 3, windowMs: 60 * 60_000 },
  resetIp: { name: "reset-password-ip", max: 10, windowMs: 60 * 60_000 },
  verifyIp: { name: "verify-email-ip", max: 30, windowMs: 60 * 60_000 },
  avatarSession: { name: "avatar-session", max: 5, windowMs: 60 * 60_000 },
  accountSession: { name: "account-session", max: 10, windowMs: 60 * 60_000 },
  passwordSession: { name: "password-session", max: 5, windowMs: 60 * 60_000 },
  guestCreateIp: { name: "guest-create-ip", max: 20, windowMs: 60 * 60_000 },
  roomCreateSession: { name: "room-create-session", max: 10, windowMs: 60 * 60_000 },
  roomMutationSession: { name: "room-mutation-session", max: 30, windowMs: 60 * 60_000 },
  roomLookupIp: { name: "room-lookup-ip", max: 30, windowMs: 60_000 },
  inviteSession: { name: "invite-session", max: 20, windowMs: 60 * 60_000 },
  reportSession: { name: "question-report-session", max: 20, windowMs: 60 * 60_000 },
  notificationSession: { name: "notification-session", max: 60, windowMs: 60_000 },
  adminMutationSession: { name: "admin-mutation-session", max: 30, windowMs: 60 * 60_000 },
} satisfies Record<string, RateLimitRule>;

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 320) : "invalid";
}

export function opaqueSessionKey(req: FastifyRequest) {
  const sid = ((req as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies)?.sid;
  return sid ? createHash("sha256").update(sid).digest("base64url").slice(0, 22) : `ip:${requestIpKey(req)}`;
}

export function rateLimitPreHandler(
  limits: Array<{ rule: RateLimitRule; key: (req: FastifyRequest) => string }>,
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    for (const limit of limits) {
      if (!(await enforceRateLimit(req, reply, limit.rule, limit.key(req)))) return;
    }
  };
}

export async function enforceRateLimit(
  req: FastifyRequest,
  reply: FastifyReply,
  rule: RateLimitRule,
  key: string,
) {
  const result = rateLimiter.consume(rule, key);
  if (result.allowed) return true;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  reply.header("Retry-After", retryAfter).header("RateLimit-Limit", rule.max)
    .header("RateLimit-Remaining", 0).header("RateLimit-Reset", retryAfter);
  req.log.warn({ rateLimit: rule.name, ip: requestIpKey(req) }, "HTTP rate limit exceeded");
  await reply.code(429).send({ error: "too-many-requests" });
  return false;
}


const SOCKET_LIMITS: Record<string, RateLimitRule> = {
  join_daily: { name: "socket-join-daily", max: 4, windowMs: 10_000 },
  daily_request_choices: { name: "socket-daily-choices", max: 4, windowMs: 10_000 },
  daily_abandon: { name: "socket-daily-abandon", max: 3, windowMs: 30_000 },
  daily_skip_question: { name: "socket-daily-skip", max: 4, windowMs: 10_000 },
  daily_submit_answer: { name: "socket-daily-answer", max: 8, windowMs: 5_000 },
  daily_submit_answer_text: { name: "socket-daily-answer-text", max: 8, windowMs: 5_000 },
  join_game: { name: "socket-join-game", max: 6, windowMs: 10_000 },
  leave_game: { name: "socket-leave-game", max: 6, windowMs: 10_000 },
  remove_lobby_player: { name: "socket-remove-player", max: 6, windowMs: 10_000 },
  return_to_lobby: { name: "socket-return-lobby", max: 3, windowMs: 30_000 },
  lobby_state: { name: "socket-lobby-state", max: 20, windowMs: 10_000 },
  start_game: { name: "socket-start-game", max: 3, windowMs: 30_000 },
  launch_next_question: { name: "socket-launch-question", max: 6, windowMs: 10_000 },
  submit_answer: { name: "socket-answer", max: 8, windowMs: 5_000 },
  submit_answer_text: { name: "socket-answer-text", max: 8, windowMs: 5_000 },
  request_choices: { name: "socket-choices", max: 4, windowMs: 10_000 },
};

export function installSocketRateLimits(socket: Socket) {
  const globalRule = { name: "socket-global", max: 120, windowMs: 10_000 };
  let lastLogAt = 0;
  socket.use(([event, ...args], next) => {
    const identity = String(socket.data.userId || socket.id);
    const rules = [globalRule, SOCKET_LIMITS[event]].filter(Boolean) as RateLimitRule[];
    for (const rule of rules) {
      const result = rateLimiter.consume(rule, identity);
      if (result.allowed) continue;
      const retryAfterMs = Math.max(1, result.resetAt - Date.now());
      const ack = args.length ? args[args.length - 1] : undefined;
      if (typeof ack === "function") ack({ ok: false, reason: "rate-limited", retryAfterMs });
      else socket.emit("rate_limit", { event, retryAfterMs });
      if (Date.now() - lastLogAt > 10_000) {
        lastLogAt = Date.now();
        console.warn("[socket-rate-limit]", { event, rateLimit: rule.name, userId: socket.data.userId, ip: normalizeClientIp(socket.handshake.address) });
      }
      return;
    }
    next();
  });
}