// Pure list logic for the staff inventory screen: availability, search, filter and sort.

export type Availability = "in_stock" | "low" | "out";

export type InventoryRow = {
  id: string;
  name: string;
  brand: string | null;
  categories: string[];
  thumbnail_path: string | null;
  limit_per_visit: number | null;
  stock: number;
  created_at: string;
};

export type SortKey = "name" | "stock_asc" | "stock_desc" | "newest";

export type InventoryFilter = {
  search: string;
  category: string | null;
  availability: Availability | null;
  sort: SortKey;
};

// Same thresholds as the public available_items view.
export const LOW_STOCK_MAX = 3;

export function availabilityOf(stock: number): Availability {
  if (stock <= 0) return "out";
  return stock <= LOW_STOCK_MAX ? "low" : "in_stock";
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const COMPARE: Record<SortKey, (a: InventoryRow, b: InventoryRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  stock_asc: (a, b) => a.stock - b.stock || a.name.localeCompare(b.name),
  stock_desc: (a, b) => b.stock - a.stock || a.name.localeCompare(b.name),
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
};

// Search matches every typed word against name, brand or category.
export function filterInventory(rows: InventoryRow[], f: InventoryFilter): InventoryRow[] {
  const words = norm(f.search).split(/\s+/).filter(Boolean);
  return rows
    .filter((r) => {
      if (f.category && !r.categories.includes(f.category)) return false;
      if (f.availability && availabilityOf(r.stock) !== f.availability) return false;
      if (!words.length) return true;
      const haystack = norm([r.name, r.brand ?? "", ...r.categories.map((c) => c.replaceAll("_", " "))].join(" "));
      return words.every((w) => haystack.includes(w));
    })
    .sort(COMPARE[f.sort]);
}
