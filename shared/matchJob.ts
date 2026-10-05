import { decideMatch, type Relation } from "./decideMatch.js";

export type CatalogItem = { id: string; name: string };
export type JobCandidate = { item_id: string; name: string; relation: Relation };

export type JobMatch =
  | { kind: "green"; itemId: string }
  | { kind: "yellow"; candidates: JobCandidate[] }
  | { kind: "new" };

// decideMatch, flattened into the shape stored on intake_jobs.candidates.
export function matchJob(name: string, catalog: CatalogItem[]): JobMatch {
  const d = decideMatch(name, catalog);
  if (d.kind === "green") return { kind: "green", itemId: d.item.id };
  if (d.kind === "new") return { kind: "new" };
  return {
    kind: "yellow",
    candidates: d.candidates.map((c) => ({ item_id: c.item.id, name: c.item.name, relation: c.relation })),
  };
}

// A sibling variety is more likely a new item than the same one; the review screen leads with "new item".
export const defaultsToNewItem = (candidates: { relation: Relation }[]) =>
  candidates.every((c) => c.relation === "one_word_off");
