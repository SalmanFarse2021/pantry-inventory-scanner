import { z } from "zod";

// The only valid categories. An item gets one or more of these (primary first), never a new one.
export const CATEGORIES = [
  "produce",
  "canned_jarred",
  "soup_broth",
  "pasta_grains_rice",
  "bread_bakery",
  "breakfast_cereal",
  "snacks",
  "beverages",
  "dairy_eggs",
  "meat_protein",
  "frozen",
  "condiments_sauces_spices",
  "baking",
  "baby",
  "supplements",
  "personal_care",
  "household",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const MAX_CATEGORIES = 3;

// Primary category first. "other" is only valid on its own.
export const CategoriesSchema = z
  .array(z.enum(CATEGORIES))
  .min(1)
  .max(MAX_CATEGORIES)
  .refine((c) => new Set(c).size === c.length, "categories must not repeat")
  .refine((c) => !c.includes("other") || c.length === 1, '"other" cannot be combined with another category');
