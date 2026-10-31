import { createHash } from "node:crypto";

/**
 * Deterministic random source: the same --seed always rebuilds the same data
 * set (mulberry32 PRNG). UUIDs are SHA-256(seed, counter) shaped as RFC 4122
 * v4 (like PostgreSQL's gen_random_uuid()): reproducible for a seed, and
 * distinct between runs — the 32-bit stream of two seeds can overlap.
 */
export class Rng {
  private s: number;
  private readonly seed: number;
  private n = 0;
  constructor(seed: number) {
    this.seed = seed;
    this.s = seed >>> 0 || 1;
  }
  /** [0, 1) */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Weighted choice: [[value, weight], …] */
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of items) {
      if ((r -= w) < 0) return v;
    }
    return items[items.length - 1][0];
  }
  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = arr.slice();
    const out: T[] = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(this.next() * copy.length), 1)[0]);
    return out;
  }
  /** Amount with 2 decimals between min and max. */
  money(min: number, max: number, step = 0.01): string {
    const v = Math.round((min + this.next() * (max - min)) / step) * step;
    return v.toFixed(2);
  }
  uuid(): string {
    const h = [...createHash("sha256").update(`seedgen:${this.seed}:${this.n++}`).digest().subarray(0, 16)];
    h[6] = (h[6] & 0x0f) | 0x40;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  }
  /** A date between two dates (inclusive). */
  dateBetween(from: Date, to: Date): Date {
    return new Date(from.getTime() + this.next() * (to.getTime() - from.getTime()));
  }
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
