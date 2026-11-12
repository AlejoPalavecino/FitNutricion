import { describe, expect, it } from 'vitest';
import { INITIAL_FOOD_ITEMS, INITIAL_RECIPES } from '../data/seedData';
import { parseEntity, snapshotSchema } from './validation';
describe('runtime contracts', () => {
  it('accepts actual food and recipe catalogs', () => {
    for (const f of INITIAL_FOOD_ITEMS) expect(parseEntity('food', f)).toEqual(f);
    for (const r of INITIAL_RECIPES) expect(parseEntity('recipe', r)).toEqual(r);
  });
  it('rejects invalid macros and impossible dates before hydration', () => {
    expect(() =>
      parseEntity('timeline', {
        id: 'a',
        date: '2026-02-30',
        hour: 12,
        gramsConsumed: 100,
        calculatedMacros: { kcal: NaN },
      }),
    ).toThrow();
    expect(() => snapshotSchema.parse({ biometricLogs: [{ id: 'bad' }] })).toThrow();
  });
  it('accepts tombstones and forward-compatible metadata', () => {
    expect(parseEntity('food', null)).toBeNull();
    expect(
      parseEntity('food', { ...INITIAL_FOOD_ITEMS[0], futureField: 'kept' })?.futureField,
    ).toBe('kept');
  });
});
