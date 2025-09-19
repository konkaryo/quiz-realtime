/* ---------------------------------------------------------------------------------------- */
// --- Difficulty distribution (room 1..10 -> P(difficulty 1..4)) -----------------
export type DifficultyVector = [number, number, number, number];

export const QUESTION_DISTRIBUTION: Record<number, DifficultyVector> = {
    1: [1,    0,    0,    0   ],
    2: [0.8,  0.2,  0,    0   ],
    3: [0.5,  0.5,  0,    0   ],
    4: [0.25, 0.5,  0.25, 0   ],
    5: [0.2,  0.4,  0.4,  0   ],
    6 :[0,    0.4,  0.4,  0.2 ],
    7: [0,    0.25, 0.5,  0.25],
    8: [0,    0,    0.5,  0.5 ],
    9: [0,    0,    0.2,  0.8 ],
    10:[0,    0,    0,    1   ]
};
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
/*
* Calcule des quotas entiers (n1..n4) qui somment à `count` à partir d’un vecteur de
* probabilités (p1..p4). On arrondit intelligemment (méthode des parties fractionnaires).
*/
export function quotasFromDistribution(probs: [number, number, number, number], count: number): [number, number, number, number] {
    const raw = probs.map(p => p * count);
    const floor = raw.map(Math.floor) as [number, number, number, number];
    let taken = floor.reduce((a, b) => a + b, 0);
    const deficit = count - taken;

    if (deficit > 0) {
        const frac = raw.map((x, i) => ({ i, f: x - Math.floor(x) }));
        frac.sort((a, b) => b.f - a.f);
        for (let k = 0; k < deficit && k < frac.length; k++) { floor[frac[k].i as 0|1|2|3] += 1; }
    }
  
    // Sécurité: si surplus (très rare), on retire aux plus petites fractions
    if (deficit < 0) {
        const frac = raw.map((x, i) => ({ i, f: x - Math.floor(x) }));
        frac.sort((a, b) => a.f - b.f);
        for (let k = 0; k < -deficit && k < frac.length; k++) {
            const idx = frac[k].i as 0|1|2|3;
            if (floor[idx] > 0) floor[idx] -= 1;
        }
    }
    return floor;
 }
/* ---------------------------------------------------------------------------------------- */