/* ---------------------------------------------------------------------------------------- */
export type DifficultyVector = [number, number, number, number];

/*
 * Calcule les quotas entiers (n1..n4) à partir d’une difficulté en pourcentage.
 * mu = 1 + 3*(p/100), sigma = 0.8, w[k] = exp(-((k-mu)^2)/(2*sigma^2)).
 * On arrondit par la méthode des plus grands restes pour sommer à `count`.
 */
export function quotasFromPercent(percent: number, count: number): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(100, percent));
  const mu = 1 + 3 * (clamped / 100);
  const sigma = 0.8;
  const denom = 2 * sigma * sigma;

  const weights = [1, 2, 3, 4].map((k) => Math.exp(-((k - mu) ** 2) / denom));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const probs = weights.map((w) => w / total);

  const raw = probs.map((p) => p * count);
  const floor = raw.map(Math.floor) as [number, number, number, number];
  const taken = floor.reduce((a, b) => a + b, 0);
  const deficit = count - taken;

  if (deficit > 0) {
    const frac = raw.map((x, i) => ({ i, f: x - Math.floor(x) }));
    frac.sort((a, b) => b.f - a.f);
    for (let k = 0; k < deficit && k < frac.length; k += 1) {
      floor[frac[k].i as 0 | 1 | 2 | 3] += 1;
    }
  
  }

  if (deficit < 0) {
    const frac = raw.map((x, i) => ({ i, f: x - Math.floor(x) }));
    frac.sort((a, b) => a.f - b.f);
    for (let k = 0; k < -deficit && k < frac.length; k += 1) {
      const idx = frac[k].i as 0 | 1 | 2 | 3;
      if (floor[idx] > 0) floor[idx] -= 1;
    }
  }

  return floor;
}
/* ---------------------------------------------------------------------------------------- */