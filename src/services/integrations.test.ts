import { describe, expect, it, vi } from 'vitest';
import { readLiteralData } from '../../scripts/literal-data';
import { parseProduct, searchOpenFoodFacts } from './openFoodFacts';
const product = {
  code: '12345678',
  product_name: 'Producto',
  nutriments: {
    'energy-kcal_100g': 100,
    proteins_100g: 0,
    carbohydrates_100g: 25,
    fat_100g: 0,
    fiber_100g: 0,
  },
};
describe('external data contracts', () => {
  it('distinguishes unknown from measured zero', () => {
    expect(parseProduct(product)?.fatPer100g).toBe(0);
    expect(
      parseProduct({ ...product, nutriments: { ...product.nutriments, proteins_100g: undefined } }),
    ).toBeNull();
    expect(
      parseProduct({ ...product, nutriments: { ...product.nutriments, fiber_100g: '' } }),
    ).toBeNull();
  });
  it('reports HTTP rate limits', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(searchOpenFoodFacts('test', undefined, request)).rejects.toThrow('limita');
  });
  it('propagates cancellation and encodes search input', async () => {
    const c = new AbortController();
    c.abort();
    const request = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      expect(options?.signal?.aborted).toBe(true);
      throw new DOMException('Aborted', 'AbortError');
    });
    await expect(searchOpenFoodFacts('pan & leche', c.signal, request)).rejects.toThrow();
    expect(String(request.mock.calls[0][0])).toContain('pan%20%26%20leche');
  });
  it('parses literal arrays and default-export dictionaries without execution', () => {
    expect(readLiteralData("const EXDB=[{id:'1',n:'press'}];")).toEqual([{ id: '1', n: 'press' }]);
    expect(readLiteralData("export default {'A':['B',-1]};")).toEqual({ A: ['B', -1] });
  });
  it('rejects calls, getters, prototype keys and executable expressions', () => {
    for (const text of [
      'export default {x:process.exit()}',
      'export default {get x(){return 1}}',
      'export default {__proto__:{evil:true}}',
      'const a=[(()=>42)()]',
    ])
      expect(() => readLiteralData(text)).toThrow();
  });
});
