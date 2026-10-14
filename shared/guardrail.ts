// Content guardrail for the Gemini intake pipeline. Pure: the model call stays in api/_lib/runJob.ts.
//
// Two layers. The prompt asks the model for an accept/reject verdict; then a keyword blocklist
// re-checks what it wrote, because a model can be wrong or be steered by text printed on a label.
//
// "other" is NOT a rejection. It means a legitimate product that fits no category. Those items are
// created but hidden from the public catalog (see the available_items view) until a human moderates them.

import { z } from "zod";
import { CATEGORIES, MAX_CATEGORIES } from "./categories.js";
import { IdentifiedItemSchema, type IdentifiedItem } from "./identifyItem.js";

export const REJECT_REASONS = [
  "not_a_product",
  "alcohol",
  "tobacco_vape",
  "medicine",
  "unsafe",
  "inappropriate",
  "not_grocery",
  "unreadable",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const REJECT_LABELS: Record<RejectReason, string> = {
  not_a_product: "Not a product",
  alcohol: "Alcohol",
  tobacco_vape: "Tobacco or vape",
  medicine: "Medicine",
  unsafe: "Unsafe item",
  inappropriate: "Inappropriate content",
  not_grocery: "Not a grocery item",
  unreadable: "Photo unreadable, retake it",
};

// Flat on purpose: Gemini's JSON schema support handles a plain object better than a union.
// Fields beyond verdict and reject_reason are only meaningful when verdict is "accept".
export const ModelOutputSchema = z.object({
  verdict: z.enum(["accept", "reject"]).describe('"reject" for anything that is not an allowed grocery-store product'),
  reject_reason: z.enum(REJECT_REASONS).nullable().describe("Required when verdict is reject, otherwise null"),
  name: z.string().describe('Brand + product + variety, no package size. Empty string when rejecting.'),
  brand: z.string().nullable(),
  size: z.string().nullable().describe("Package size ONLY if clearly legible; otherwise null. Never guess."),
  categories: z
    .array(z.enum(CATEGORIES))
    .max(MAX_CATEGORIES)
    .describe(`1 to ${MAX_CATEGORIES} categories from the fixed list, primary first. Empty array when rejecting.`),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().nullable().describe("Only if something needs the worker's attention"),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export type Decision =
  | { kind: "accept"; item: IdentifiedItem }
  | { kind: "reject"; reason: RejectReason };

// Whole words, case and accent insensitive. Deliberately limited to unambiguous terms; the model
// handles nuance, this only catches obvious misses. "root beer" and "wine vinegar" are exempt
// because they are ordinary grocery items that are not alcohol. Left out on purpose because they
// collide with real products: "ale" (ginger ale), "scotch" (Scotch-Brite), "melatonin" (a supplement).
const BLOCKLIST: [Exclude<RejectReason, "not_a_product" | "unsafe" | "inappropriate" | "not_grocery" | "unreadable">, string[]][] = [
  [
    "alcohol",
    [
      "alcohol", "alcoholic", "beer", "lager", "stout", "ipa", "wine", "champagne", "prosecco", "sangria",
      "vodka", "whiskey", "whisky", "bourbon", "rum", "tequila", "mezcal", "gin", "brandy", "cognac",
      "liquor", "liqueur", "spirits", "sake", "soju", "hard cider", "hard seltzer", "cocktail", "margarita",
      "mojito", "daiquiri", "mimosa", "bloody mary", "ginger beer",
    ],
  ],
  ["tobacco_vape", ["tobacco", "cigarette", "cigar", "vape", "vaping", "e-cig", "e-cigarette", "nicotine", "hookah", "juul", "snuff"]],
  [
    "medicine",
    [
      "medicine", "medication", "prescription", "rx", "ibuprofen", "acetaminophen", "tylenol", "advil", "motrin", "aspirin",
      "aleve", "naproxen", "benadryl", "antihistamine", "antacid", "pepto", "nyquil", "dayquil", "mucinex", "robitussin",
      "cough syrup", "cold and flu", "pain reliever", "laxative",
    ],
  ],
];
const EXEMPT = /\b(root beer|wine vinegar)\b/g;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS = BLOCKLIST.map(
  ([reason, words]) => [reason, new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(escape).join("|")})s?(?![\\p{L}\\p{N}])`, "u")] as const,
);

// First blocklist reason found in the text, or null.
export function blocklistReason(...texts: (string | null | undefined)[]): RejectReason | null {
  const text = fold(texts.filter(Boolean).join(" \n ")).replace(EXEMPT, " ");
  for (const [reason, re] of PATTERNS) if (re.test(text)) return reason;
  return null;
}

// Turn the model's answer into accept or reject. Throws when an "accept" is malformed, so the
// model chain treats it as a bad answer (retry, then next tier) instead of trusting it.
export function decide(out: ModelOutput): Decision {
  const hit = blocklistReason(out.name, out.brand, out.note);
  if (out.verdict === "reject") return { kind: "reject", reason: out.reject_reason ?? hit ?? "not_grocery" };
  if (hit) return { kind: "reject", reason: hit };

  const item = IdentifiedItemSchema.parse({
    name: out.name.trim(),
    brand: out.brand,
    size: out.size,
    categories: out.categories,
    confidence: out.confidence,
    note: out.note,
  });
  return { kind: "accept", item };
}
