import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';
interface Envelope {
  format: 'fitnutricion-storage-v1';
  revision: number;
  value: string;
}
let clock = 0;
function unpack(raw: string | null | undefined): { revision: number; value: string } | null {
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw);
    if (
      value?.format === 'fitnutricion-storage-v1' &&
      Number.isFinite(value.revision) &&
      typeof value.value === 'string'
    )
      return value;
  } catch {
    /* Legacy payloads are validated during hydration. */
  }
  return { revision: 0, value: raw };
}
export const offlineFirstStorage: StateStorage = {
  async getItem(name) {
    let local: ReturnType<typeof unpack> = null,
      remote: ReturnType<typeof unpack> = null;
    try {
      if (typeof localStorage !== 'undefined') local = unpack(localStorage.getItem(name));
    } catch {
      /* Try IndexedDB independently. */
    }
    try {
      if (typeof indexedDB !== 'undefined') remote = unpack(await get<string>(name));
    } catch {
      /* Local mirror may still be durable. */
    }
    const latest =
      local && remote ? (local.revision >= remote.revision ? local : remote) : (local ?? remote);
    clock = Math.max(clock, latest?.revision ?? 0);
    return latest?.value ?? null;
  },
  async setItem(name, value) {
    clock = Math.max(Date.now(), clock + 1);
    const envelope: Envelope = { format: 'fitnutricion-storage-v1', revision: clock, value };
    const encoded = JSON.stringify(envelope);
    let stored = false;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(name, encoded);
        stored = true;
      }
    } catch {
      /* IndexedDB may still accept a larger snapshot. */
    }
    try {
      if (typeof indexedDB !== 'undefined') {
        await set(name, encoded);
        stored = true;
      }
    } catch {
      /* Notify when both stores fail. */
    }
    if (!stored) throw new Error('No durable browser storage is available.');
  },
  async removeItem(name) {
    let failed = false;
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
    } catch {
      failed = true;
    }
    try {
      if (typeof indexedDB !== 'undefined') await del(name);
    } catch {
      failed = true;
    }
    if (failed) throw new Error('No se pudieron borrar todas las copias.');
  },
};
