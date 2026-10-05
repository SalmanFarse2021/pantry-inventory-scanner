import { z } from "zod";
import { CATEGORIES, CategoriesSchema, MAX_CATEGORIES } from "./categories";

// What the vision model returns for one single-item photo.
export const IdentifiedItemSchema = z.object({
  name: z.string().min(1).describe('Brand + product + variety, no package size. e.g. "Barilla Whole Grain Thin Spaghetti"'),
  brand: z.string().nullable(),
  size: z.string().nullable().describe("Package size ONLY if clearly legible; otherwise null. Never guess."),
  categories: CategoriesSchema.describe(`1 to ${MAX_CATEGORIES} categories from the fixed list, primary first`),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().nullable().describe("Only if something needs the worker's attention"),
});
export type IdentifiedItem = z.infer<typeof IdentifiedItemSchema>;

export const IDENTIFY_SYSTEM = `You help a school pantry worker log donated items. The photo shows ONE product, usually held \
in hand or on a counter. Return that product.

- name: brand + product + variety, the way it would be written on an inventory sheet. Include the variety \
(flavor, type, grind, strength) when the label shows it, because the same brand sells several. Do not include package size.
- Read the label. If you cannot read enough to be sure, give your best guess, set confidence to "low", and \
say what is uncertain in "note". Never invent a brand you cannot see.
- categories: choose ONLY from this fixed list: ${CATEGORIES.join(", ")}. Use the single best category. Add a \
second or third only if the product genuinely belongs to more than one (for example a protein bar that is both \
snacks and supplements). Primary category first. Never invent a category. Use "other" only when nothing fits, and then alone.`;

// Models sometimes return valid JSON followed by extra text (seen with gemma). Take the first
// complete top-level object instead of failing the whole attempt.
export function parseModelJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in model output");
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("unterminated JSON object in model output");
}
