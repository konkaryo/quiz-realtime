// server/src/utils/botLogger.ts
import fs from "fs";
import path from "path";

/** Activer/désactiver le log via l'env (par défaut ON) */
const BOT_LOG_ENABLED = process.env.BOT_LOG?.toLowerCase() !== "false";

let stream: fs.WriteStream | null = null;
let initialized = false;
let resolvedPath = "";

/** remonte jusqu'à "server" (depuis src/utils ou dist/utils) */
function findServerRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const base = path.basename(dir).toLowerCase();
    if (base === "src" || base === "dist") return path.resolve(dir, "..");
    dir = path.resolve(dir, "..");
  }
  return process.cwd();
}

function resolveLogPath(): string {
  const serverRoot = findServerRoot();
  const env = process.env.BOT_LOG_FILE; // e.g. "logs/bots.log" ou "C:\...\bots.log"
  if (env && env.trim()) return path.isAbsolute(env) ? env : path.join(serverRoot, env);
  return path.join(serverRoot, "logs", "bots.log");
}

export function initBotLogger() {
  if (!BOT_LOG_ENABLED) {
    initialized = true; // considéré initialisé mais no-op
    return;
  }
  if (initialized && stream && !stream.destroyed) return;

  try {
    resolvedPath = resolveLogPath();
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    stream = fs.createWriteStream(resolvedPath, { flags: "a" });
    stream.write(`\n=== BOT LOG START ${new Date().toISOString()} ===\n`);
    initialized = true;
    console.log(`[botlog] writing to: ${resolvedPath}`);

    process.on("beforeExit", () => { try { stream?.end(); } catch {} });
    process.on("SIGINT", () => { try { stream?.end(); } catch {}; process.exit(0); });
  } catch (e) {
    initialized = false;
    stream = null;
    console.error("[botlog] init failed:", e);
  }
}

/** format compact k=v k=v … */
function fmtKV(data?: Record<string, any>): string {
  if (!data) return "";
  return Object.entries(data)
    .map(([k, v]) => {
      if (v === null || v === undefined) return `${k}=null`;
      if (typeof v === "string") {
        // protège les espaces
        return `${k}=${JSON.stringify(v)}`;
      }
      return `${k}=${JSON.stringify(v)}`;
    })
    .join(" ");
}

/** sur une ligne : timestamp, event, et KV */
function writeLine(event: string, data?: Record<string, any>) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${event}` + (data ? "  " + fmtKV(data) : "");
  if (!BOT_LOG_ENABLED) {
    // même si désactivé, on laisse la console pour debug local
    console.log(line);
    return;
  }
  if (!initialized || !stream || stream.destroyed) initBotLogger();
  try { stream!.write(line + "\n"); } catch (e) { console.error("[botlog] write error:", e); }
}

/* ---------------- API publique ---------------- */

/** Surcharges pour accepter 1 ou 2 arguments. */
export function logBot(event: string): void;
export function logBot(event: string, data: Record<string, any>): void;
export function logBot(event: string, data?: Record<string, any>) {
  writeLine(event, data);
}
