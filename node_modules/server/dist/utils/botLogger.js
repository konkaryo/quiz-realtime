"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initBotLogger = initBotLogger;
exports.logBot = logBot;
// server/src/utils/botLogger.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/** Activer/désactiver le log via l'env (par défaut ON) */
const BOT_LOG_ENABLED = process.env.BOT_LOG?.toLowerCase() !== "false";
let stream = null;
let initialized = false;
let resolvedPath = "";
/** remonte jusqu'à "server" (depuis src/utils ou dist/utils) */
function findServerRoot() {
    let dir = __dirname;
    for (let i = 0; i < 6; i++) {
        const base = path_1.default.basename(dir).toLowerCase();
        if (base === "src" || base === "dist")
            return path_1.default.resolve(dir, "..");
        dir = path_1.default.resolve(dir, "..");
    }
    return process.cwd();
}
function resolveLogPath() {
    const serverRoot = findServerRoot();
    const env = process.env.BOT_LOG_FILE; // e.g. "logs/bots.log" ou "C:\...\bots.log"
    if (env && env.trim())
        return path_1.default.isAbsolute(env) ? env : path_1.default.join(serverRoot, env);
    return path_1.default.join(serverRoot, "logs", "bots.log");
}
function initBotLogger() {
    if (!BOT_LOG_ENABLED) {
        initialized = true; // considéré initialisé mais no-op
        return;
    }
    if (initialized && stream && !stream.destroyed)
        return;
    try {
        resolvedPath = resolveLogPath();
        fs_1.default.mkdirSync(path_1.default.dirname(resolvedPath), { recursive: true });
        stream = fs_1.default.createWriteStream(resolvedPath, { flags: "a" });
        stream.write(`\n=== BOT LOG START ${new Date().toISOString()} ===\n`);
        initialized = true;
        console.log(`[botlog] writing to: ${resolvedPath}`);
        process.on("beforeExit", () => { try {
            stream?.end();
        }
        catch { } });
        process.on("SIGINT", () => { try {
            stream?.end();
        }
        catch { } ; process.exit(0); });
    }
    catch (e) {
        initialized = false;
        stream = null;
        console.error("[botlog] init failed:", e);
    }
}
/** format compact k=v k=v … */
function fmtKV(data) {
    if (!data)
        return "";
    return Object.entries(data)
        .map(([k, v]) => {
        if (v === null || v === undefined)
            return `${k}=null`;
        if (typeof v === "string") {
            // protège les espaces
            return `${k}=${JSON.stringify(v)}`;
        }
        return `${k}=${JSON.stringify(v)}`;
    })
        .join(" ");
}
/** sur une ligne : timestamp, event, et KV */
function writeLine(event, data) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${event}` + (data ? "  " + fmtKV(data) : "");
    if (!BOT_LOG_ENABLED) {
        // même si désactivé, on laisse la console pour debug local
        console.log(line);
        return;
    }
    if (!initialized || !stream || stream.destroyed)
        initBotLogger();
    try {
        stream.write(line + "\n");
    }
    catch (e) {
        console.error("[botlog] write error:", e);
    }
}
function logBot(event, data) {
    writeLine(event, data);
}
