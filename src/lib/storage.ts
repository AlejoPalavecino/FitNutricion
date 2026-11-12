import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

/**
 * Adaptador de almacenamiento Offline-First híbrido (IndexedDB + espejo rápido en LocalStorage).
 * Los errores de escritura se propagan cuando no existe una copia durable.
 */
export const offlineFirstStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (typeof indexedDB !== 'undefined') {
        const idbValue = await get<string>(name);
        if (idbValue !== undefined && idbValue !== null) {
          return idbValue;
        }
      }
    } catch {
      // Fallback silencioso a LocalStorage si IndexedDB está restringido
    }
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    let stored = false;
    try {
      if (typeof localStorage !== 'undefined') { localStorage.setItem(name, value); stored = true; }
    } catch { /* IndexedDB may still accept the write. */ }
    try {
      if (typeof indexedDB !== 'undefined') { await set(name, value); stored = true; }
    } catch { /* The caller is notified if neither store succeeded. */ }
    if (!stored) throw new Error('No durable browser storage is available.');
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(name);
      }
      if (typeof indexedDB !== 'undefined') {
        await del(name);
      }
    } catch {
      // Ignorar errores de limpieza
    }
  },
};
