/** Générateur pseudo-aléatoire déterministe (mulberry32) : l'état tient dans un entier, rangé dans la partie. */
export interface Rng {
  seed: number;
}

export function next(rng: Rng): number {
  let t = (rng.seed = (rng.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(rng: Rng, n: number): number {
  return Math.floor(next(rng) * n);
}

export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) | 0;
}
