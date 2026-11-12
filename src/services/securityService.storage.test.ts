import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSensitiveUserStorage } from './securityService';
const { remove } = vi.hoisted(() => ({ remove: vi.fn().mockResolvedValue(undefined) }));
vi.mock('idb-keyval', () => ({ del: remove }));
describe('account-scoped device erasure', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map([
      ['fitnutricion-user-data-v2:A', 'private-a'],
      ['fitnutricion-user-data-v2:B', 'private-b'],
    ]);
    vi.stubGlobal('localStorage', { removeItem: vi.fn((key: string) => values.delete(key)) });
    vi.stubGlobal('indexedDB', {});
    remove.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('removes every copy of A without wiping B or unrelated browser storage', async () => {
    await clearSensitiveUserStorage('A');
    expect(values.has('fitnutricion-user-data-v2:A')).toBe(false);
    expect(values.get('fitnutricion-user-data-v2:B')).toBe('private-b');
    expect(remove).toHaveBeenCalledWith('fitnutricion-user-data-v2:A');
    expect(remove).not.toHaveBeenCalledWith('fitnutricion-user-data-v2:B');
  });
  it('attempts IndexedDB cleanup even when localStorage throws, and reports incomplete erasure', async () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    await expect(clearSensitiveUserStorage('A')).rejects.toThrow('borrar todas');
    expect(remove).toHaveBeenCalledWith('fitnutricion-user-data-v2:A');
  });
});
