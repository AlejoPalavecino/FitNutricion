import type { FoodItem } from '../types/nutrition';
export interface FoodSearchResult {
  foods: FoodItem[];
  incompleteCount: number;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function nutrient(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
/** Unknown nutrient values are not silently converted to zero. */
export function parseProduct(raw: unknown): FoodItem | null {
  const p = record(raw),
    n = record(p.nutriments),
    code = String(p.code ?? '');
  if (!/^\d{8,14}$/.test(code)) return null;
  const kcal = nutrient(n['energy-kcal_100g']),
    protein = nutrient(n.proteins_100g),
    carbs = nutrient(n.carbohydrates_100g),
    fat = nutrient(n.fat_100g),
    fiber = nutrient(n.fiber_100g);
  if ([kcal, protein, carbs, fat, fiber].some((v) => v === null)) return null;
  const name = p.product_name_es || p.product_name;
  if (typeof name !== 'string' || !name.trim()) return null;
  return {
    id: `off-${code}`,
    barcode: code,
    name: name.slice(0, 200),
    brand: typeof p.brands === 'string' ? p.brands.slice(0, 120) : 'Open Food Facts',
    kcalPer100g: kcal!,
    proteinPer100g: protein!,
    carbsPer100g: carbs!,
    fatPer100g: fat!,
    fiberPer100g: fiber!,
    defaultServingName: '100 g',
    defaultServingGrams: 100,
    isCustom: true,
    isFavorite: false,
  };
}
export async function searchOpenFoodFacts(
  query: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<FoodSearchResult> {
  const q = query.trim().slice(0, 120);
  if (!q) return { foods: [], incompleteCount: 0 };
  const barcode = /^\d{8,14}$/.test(q);
  const url = barcode
    ? `https://world.openfoodfacts.org/api/v2/product/${q}.json`
    : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10`;
  const controller = new AbortController(),
    abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await request(url, { signal: controller.signal });
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? 'Open Food Facts limita las consultas. Reintenta más tarde.'
          : 'No se pudo consultar Open Food Facts.',
      );
    const body = record(await response.json());
    const rows: unknown[] = barcode
      ? body.product
        ? [{ ...record(body.product), code: q }]
        : []
      : Array.isArray(body.products)
        ? body.products
        : [];
    const foods = rows.map(parseProduct).filter((p): p is FoodItem => p !== null);
    return { foods, incompleteCount: rows.length - foods.length };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
