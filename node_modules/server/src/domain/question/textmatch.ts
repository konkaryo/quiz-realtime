/* ---------------------------------------------------------------------------------------- */
export function norm(s: string): string {
    let t = (s ?? "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/['’`´]/g, "'");
    t = t.replace(/[^a-z0-9]+/g, " ").trim();
    if (!t) return "";
    const STOP = new Set(["le","la","les","l","un","une","des","du","de","d","au","aux","et",
        "&","à","en","sur","sous","dans","par","pour","the","a","an","of"]);
    const tokens = t.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) return tokens[0];

    const KEEP_UNE_AFTER = [
        ["et"], ["dix"], ["vingt"], ["trente"], ["quarante"], ["cinquante"], ["soixante"],
        ["soixante", "dix"], ["quatre", "vingts"], ["quatre", "vingt", "dix"],
        ["septante"], ["nonante"], ["huitante"],
    ];
    const followsKeptPredecessor = (index: number): boolean => KEEP_UNE_AFTER.some(words =>
        words.length <= index && words.every((word, offset) => tokens[index - words.length + offset] === word)
    );

    return tokens
        .filter((tok, index) => !STOP.has(tok) || ((tok === "un" || tok === "une") && followsKeptPredecessor(index)))
        .join(" ");
}
/* ---------------------------------------------------------------------------------------- */

export function normalizeExactRequirement(s: string): string {
    return (s ?? "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

export function hasRequiredExactMatch(answer: string, exactNorms: string[]): boolean {
    if (exactNorms.length === 0) return true;

    const candidate = normalizeExactRequirement(answer);
    return exactNorms.some(exactNorm => {
        if (!exactNorm) return false;

        let index = candidate.indexOf(exactNorm);
        while (index !== -1) {
            const beforeIsBoundary = index === 0 || candidate[index - 1] === " ";
            const end = index + exactNorm.length;
            const afterIsBoundary = end === candidate.length || candidate[end] === " ";
            if (beforeIsBoundary && afterIsBoundary) return true;
            index = candidate.indexOf(exactNorm, index + 1);
        }
        return false;
    });
}

export function isTextAnswerCorrect(answer: string, acceptedNorms: string[], exactNorms: string[]): boolean {
    return isFuzzyMatch(norm(answer), acceptedNorms) && hasRequiredExactMatch(answer, exactNorms);
}

export type TextAnswerResult = "correct" | "close" | "wrong";

/**
 * Classifies a text answer without making a close answer valid. A close answer is
 * exactly one edit beyond the tolerance of at least one accepted spelling.
 */
export function classifyTextAnswer(answer: string, acceptedNorms: string[], exactNorms: string[]): TextAnswerResult {
    const userNorm = norm(answer);
    if (!userNorm) return "wrong";

    const fuzzyMatch = isFuzzyMatch(userNorm, acceptedNorms);
    if (fuzzyMatch && hasRequiredExactMatch(answer, exactNorms)) return "correct";
    if (fuzzyMatch) return "wrong";

    for (const accepted of acceptedNorms) {
        if (!accepted) continue;
        const closeLimit = maxEditsFor(accepted.length) + 1;
        if (Math.abs(userNorm.length - accepted.length) > closeLimit) continue;
        if (damerauLevenshteinWithCutoff(userNorm, accepted, closeLimit) <= closeLimit) return "close";
    }

    return "wrong";
}


/* ---------------------------------------------------------------------------------------- */
export function isFuzzyMatch(userNorm: string, accepted: string[]): boolean {
    if (!userNorm) return false;
    // 1) exact rapide
    if (accepted.includes(userNorm)) return true;

    // 2) sinon fuzzy avec early exit
    for (const acc of accepted) {
        if (!acc) continue;
        const refLen = acc.length;
        const maxEdits = maxEditsFor(refLen);
        if (Math.abs(userNorm.length - refLen) > maxEdits) continue;
        if (userNorm === acc) return true;
        const d = damerauLevenshteinWithCutoff(userNorm, acc, maxEdits);
        if (d <= maxEdits) return true;
    }
    return false;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
function maxEditsFor(refLen: number): number {
    if (refLen <= 4) return 0;
    if (refLen <= 8) return 1;
    if (refLen <= 15) return 2;
    return 3;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
function damerauLevenshteinWithCutoff(a: string, b: string, maxEdits: number): number {
    const n = a.length, m = b.length;
    const diff = Math.abs(n - m);
    if (diff > maxEdits) return maxEdits + 1;

    const INF = maxEdits + 1;

    let prev = new Array(m + 1).fill(INF);
    let curr = new Array(m + 1).fill(INF);
    let prevPrev = new Array(m + 1).fill(INF);

    // ligne 0 : distance à la chaîne vide
    for (let j = 0; j <= m; j++) prev[j] = Math.min(j, INF);

    for (let i = 1; i <= n; i++) {
        const from = Math.max(1, i - maxEdits);
        const to   = Math.min(m, i + maxEdits);

        // re-init ligne courante
        curr.fill(INF);
        curr[0] = Math.min(i, INF);

        let rowMin = curr[0];

        for (let j = from; j <= to; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;

            let val = Math.min(
            prev[j] + 1,       // suppression
            curr[j - 1] + 1,   // insertion
            prev[j - 1] + cost // substitution
            );

            // transposition (Damerau)
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                val = Math.min(val, prevPrev[j - 2] + 1);
            }

            curr[j] = Math.min(val, INF);
            if (curr[j] < rowMin) rowMin = curr[j];
        }

        if (rowMin > maxEdits) return maxEdits + 1;

        // rotation de buffers (pas de copie colonne par colonne)
        [prevPrev, prev, curr] = [prev, curr, prevPrev];
    }

    const dist = prev[m];
    return dist > maxEdits ? maxEdits + 1 : dist;
}
/* ---------------------------------------------------------------------------------------- */