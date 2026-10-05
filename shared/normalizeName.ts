// Turns a product name into comparable parts. Identity is brand + product + variety, so package
// sizes ("32 oz", "240 capsules") are dropped, while other numbers ("365", "2%", "500 mg") are kept
// because they are usually part of the product.

export type NormalizedName = { words: string[]; numbers: string[] };

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "with", "for", "in"]);

// number + unit that describes package size, not the product itself.
const SIZE_UNITS = "fl\\.?\\s*oz|oz|ounces?|lbs?|pounds?|kg|g|ml|l|ct|count|pk|packs?|capsules?|softgels?|tablets?|gummies|rolls?|packets?|bags?|bottles?|cans?";
const SIZE_RE = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${SIZE_UNITS})\\b\\.?`, "g");

function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function normalizeName(name: string): NormalizedName {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "") // "mom's" -> "moms"
    .replace(SIZE_RE, " ")
    .replace(/[^a-z0-9%.\s]/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  const words: string[] = [];
  const numbers: string[] = [];
  for (const raw of cleaned.split(/\s+/).filter(Boolean)) {
    if (/^\d+(\.\d+)?%?$/.test(raw)) numbers.push(raw);
    else if (!STOPWORDS.has(raw)) words.push(singular(raw));
  }
  return { words, numbers: numbers.sort() };
}
