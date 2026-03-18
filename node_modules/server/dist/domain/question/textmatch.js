"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.norm = norm;
exports.isFuzzyMatch = isFuzzyMatch;
/* ---------------------------------------------------------------------------------------- */
function norm(s) {
    let t = (s ?? "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/['’`´]/g, "'");
    t = t.replace(/[^a-z0-9]+/g, " ").trim();
    if (!t)
        return "";
    const STOP = new Set(["le", "la", "les", "l", "un", "une", "des", "du", "de", "d", "au", "aux", "et",
        "&", "à", "en", "sur", "sous", "dans", "par", "pour", "the", "a", "an", "of"]);
    const tokens = t.split(/\s+/).filter(tok => tok && !STOP.has(tok));
    return tokens.join(" ");
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
function isFuzzyMatch(userNorm, accepted) {
    if (!userNorm)
        return false;
    // 1) exact rapide
    if (accepted.includes(userNorm))
        return true;
    // 2) sinon fuzzy avec early exit
    for (const acc of accepted) {
        if (!acc)
            continue;
        const refLen = acc.length;
        const maxEdits = maxEditsFor(refLen);
        if (Math.abs(userNorm.length - refLen) > maxEdits)
            continue;
        if (userNorm === acc)
            return true;
        const d = damerauLevenshteinWithCutoff(userNorm, acc, maxEdits);
        if (d <= maxEdits)
            return true;
    }
    return false;
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
function maxEditsFor(refLen) {
    if (refLen <= 3)
        return 0; // "Lyon" → tolérance 0
    if (refLen <= 6)
        return 1; // "Paris" → 1 erreur typique
    if (refLen <= 10)
        return 2; // "Manchester" court → 2
    if (refLen <= 15)
        return 3;
    return Math.min(4, Math.floor(refLen * 0.15));
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
function damerauLevenshteinWithCutoff(a, b, maxEdits) {
    const n = a.length, m = b.length;
    const diff = Math.abs(n - m);
    if (diff > maxEdits)
        return maxEdits + 1;
    const INF = maxEdits + 1;
    let prev = new Array(m + 1).fill(INF);
    let curr = new Array(m + 1).fill(INF);
    let prevPrev = new Array(m + 1).fill(INF);
    // ligne 0 : distance à la chaîne vide
    for (let j = 0; j <= m; j++)
        prev[j] = Math.min(j, INF);
    for (let i = 1; i <= n; i++) {
        const from = Math.max(1, i - maxEdits);
        const to = Math.min(m, i + maxEdits);
        // re-init ligne courante
        curr.fill(INF);
        curr[0] = Math.min(i, INF);
        let rowMin = curr[0];
        for (let j = from; j <= to; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let val = Math.min(prev[j] + 1, // suppression
            curr[j - 1] + 1, // insertion
            prev[j - 1] + cost // substitution
            );
            // transposition (Damerau)
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                val = Math.min(val, prevPrev[j - 2] + 1);
            }
            curr[j] = Math.min(val, INF);
            if (curr[j] < rowMin)
                rowMin = curr[j];
        }
        if (rowMin > maxEdits)
            return maxEdits + 1;
        // rotation de buffers (pas de copie colonne par colonne)
        [prevPrev, prev, curr] = [prev, curr, prevPrev];
    }
    const dist = prev[m];
    return dist > maxEdits ? maxEdits + 1 : dist;
}
/* ---------------------------------------------------------------------------------------- */ 
