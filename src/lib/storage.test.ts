import { indexedDB } from 'fake-indexeddb';
import { clear, set } from 'idb-keyval';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { offlineFirstStorage } from './storage';
let data: Map<string, string>;
beforeEach(async () => {
  data = new Map();
  vi.stubGlobal('indexedDB', indexedDB);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  });
  await clear();
});
afterEach(() => vi.unstubAllGlobals());
it('prefers the newer durable mirror after interrupted IndexedDB write', async () => {
  const key = 'health';
  await set(key, JSON.stringify({ format: 'fitnutricion-storage-v1', revision: 1, value: 'old' }));
  data.set(key, JSON.stringify({ format: 'fitnutricion-storage-v1', revision: 2, value: 'new' }));
  expect(await offlineFirstStorage.getItem(key)).toBe('new');
});
it('accepts legacy snapshots and removes both copies', async () => {
  data.set('health', '{"legacy":true}');
  expect(await offlineFirstStorage.getItem('health')).toBe('{"legacy":true}');
  await offlineFirstStorage.setItem('health', 'updated');
  expect(await offlineFirstStorage.getItem('health')).toBe('updated');
  await offlineFirstStorage.removeItem('health');
  expect(await offlineFirstStorage.getItem('health')).toBeNull();
});
