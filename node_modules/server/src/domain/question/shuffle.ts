import type { GameState } from "../../types";

/* ---------------------------------------------------------------------------------------- */
function seededShuffle<T>(arr: T[], seedStr: string): T[] {
    const rnd = mulberry32(hash32(seedStr));
    const copy = arr.slice();
    // Fisher–Yates with seeded RNG
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function getShuffledChoicesForSocket(st: GameState, socketId: string) {
    const q = st.questions[st.index];
    const base = q.choices.map(c => ({ id: c.id, label: c.label })); // pas d'isCorrect
    return seededShuffle(base, `${q.id}:${socketId}`);
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
// Deterministic PRNG (Mulberry32) from a 32-bit seed
function mulberry32(seed: number) {
    return function() {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
// Simple 32-bit hash of a string (for seeding)
function hash32(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
/* ---------------------------------------------------------------------------------------- */
