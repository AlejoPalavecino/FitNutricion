import { describe, expect, it } from 'vitest';
import { generateUuid } from './ids';
describe('entity identifiers', () => {
  it('generates independent UUIDs for every entity', () => {
    const ids = Array.from({ length: 1000 }, () => generateUuid());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-f0-9-]{36}$/.test(id))).toBe(true);
  });
});
