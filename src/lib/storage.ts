import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

/**
 * Adaptador de almacenamiento Offline-First híbrido (IndexedDB + espejo rápido en LocalStorage).
 * Garantiza latencia cero en lecturas/escrituras y soporte de grandes catálogos de alimentos/logs.
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
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(name, value);
      }
    } catch {
      // Ignorar errores de cuota en LocalStorage
    }
    try {
      if (typeof indexedDB !== 'undefined') {
        await set(name, value);
      }
    } catch {
      // Ignorar si IndexedDB no está disponible en el entorno actual
    }
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
