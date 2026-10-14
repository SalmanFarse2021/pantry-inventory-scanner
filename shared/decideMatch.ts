import { normalizeName, type NormalizedName } from "./normalizeName.js";

// How a new name relates to one existing item's name.
//   same             every word matches (typos tolerated inside a word), numbers equal
//   subset           one name has extra words the other lacks ("Salted"), nothing contradicts
//   number_conflict  words match but the numbers differ
//   one_word_off     all words match except one on each side (Beef vs Chicken, or a misread)
export type Relation = "same" | "subset" | "number_conflict" | "one_word_off";

export type Candidate<T> = { item: T; relation: Relation };
export type Decision<T> =
  | { kind: "green"; item: T }
  | { kind: "yellow"; candidates: Candidate<T>[] }
  | { kind: "new" };

// Typo tolerance by word length. Short words must match exactly: "beef"/"beet" are different items.
function maxEdits(len: number): number {
  return len <= 4 ? 0 : len <= 7 ? 1 : 2;
}

// Optimal string alignment distance (insert, delete, substitute, swap neighbours).
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const wordsMatch = (a: string, b: string) => distance(a, b) <= maxEdits(Math.min(a.length, b.length));

// Greedy pairing is enough: names are a handful of words, and exact matches are taken first.
function unmatched(from: string[], into: string[]): { left: string[]; rest: string[] } {
  const rest = [...into];
  const left: string[] = [];
  const pass = (exactOnly: boolean, words: string[]) => {
    const remaining: string[] = [];
    for (const w of words) {
      const i = rest.findIndex((r) => (exactOnly ? r === w : wordsMatch(r, w)));
      if (i >= 0) rest.splice(i, 1);
      else remaining.push(w);
    }
    return remaining;
  };
  left.push(...pass(false, pass(true, from)));
  return { left, rest };
}

export function relate(a: NormalizedName, b: NormalizedName): Relation | null {
  if (!a.words.length || !b.words.length) return null;
  const { left: onlyA, rest: onlyB } = unmatched(a.words, b.words);
  const sameNumbers = a.numbers.join(",") === b.numbers.join(",");
  if (!onlyA.length && !onlyB.length) return sameNumbers ? "same" : "number_conflict";
  if (!onlyA.length || !onlyB.length) {
    // One name only adds words. A number on one side only is fine; two different numbers is a conflict.
    return sameNumbers || !a.numbers.length || !b.numbers.length ? "subset" : null;
  }
  if (onlyA.length === 1 && onlyB.length === 1 && a.words.length > 1 && sameNumbers) return "one_word_off";
  return null;
}

// Gemini-first matching: the name read from the label is compared with existing item names.
// Only "same" with no competing candidate resolves automatically. Anything else needs the user's eye.
export function decideMatch<T extends { name: string }>(name: string, catalog: T[]): Decision<T> {
  const q = normalizeName(name);
  const candidates: Candidate<T>[] = [];
  for (const item of catalog) {
    const relation = relate(q, normalizeName(item.name));
    if (relation) candidates.push({ item, relation });
  }
  const order: Relation[] = ["same", "subset", "number_conflict", "one_word_off"];
  candidates.sort((x, y) => order.indexOf(x.relation) - order.indexOf(y.relation));
  if (!candidates.length) return { kind: "new" };
  const same = candidates.filter((c) => c.relation === "same");
  if (same.length === 1 && candidates.every((c) => c === same[0] || c.relation === "one_word_off")) {
    return { kind: "green", item: same[0].item };
  }
  return { kind: "yellow", candidates };
}
