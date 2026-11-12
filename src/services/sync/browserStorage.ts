import { get, set } from 'idb-keyval';
import { emptyJournal, type Journal, type JournalStorage } from './engine';
/** IndexedDB is authoritative; Web Locks serialize all tabs of one account. */
export function browserJournal(userId: string): JournalStorage {
  const key = `fitnutricion-sync-v1:${userId}`;
  return {
    async transaction<T>(work: (journal: Journal) => Promise<T>): Promise<T> {
      if (typeof indexedDB === 'undefined' || typeof navigator === 'undefined' || !navigator.locks)
        throw new Error('La sincronización requiere IndexedDB, HTTPS y Web Locks.');
      return navigator.locks.request(key, async () => {
        const stored = await get<Journal>(key);
        if (
          stored &&
          (stored.schema !== 1 || !Array.isArray(stored.operations) || !stored.documents)
        )
          throw new Error('Cola incompatible. Conserva una copia antes de migrar.');
        const journal = stored ?? emptyJournal();
        const result = await work(journal);
        await set(key, journal);
        return result;
      });
    },
  };
}
