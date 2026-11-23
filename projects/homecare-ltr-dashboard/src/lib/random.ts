/** Small seeded PRNG (mulberry32) so demo data is deterministic. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed: number) { this.next = mulberry32(seed); }
  float(): number { return this.next(); }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r < 0) return items[i]; }
    return items[items.length - 1];
  }
}

/** Split `total` into `parts` integers around `total/parts` with ±spread jitter, summing exactly to total. */
export function jitterSplit(rng: Rng, total: number, parts: number, spread: number): number[] {
  const base = total / parts;
  const raw = Array.from({ length: parts }, () => Math.max(1, Math.round(base + (rng.float() * 2 - 1) * spread)));
  let diff = total - raw.reduce((a, b) => a + b, 0);
  let i = 0;
  while (diff !== 0) {
    const k = i % parts;
    if (diff > 0) { raw[k]++; diff--; } else if (raw[k] > 1) { raw[k]--; diff++; }
    i++;
  }
  return raw;
}
