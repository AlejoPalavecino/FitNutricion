import { z } from 'zod';
import { generateUuid } from '../../lib/ids';
import type { Change, SyncEngine } from './engine';
import { KINDS } from './engine';
const batchSchema = z.object({
  id: z.string().uuid(),
  changes: z
    .array(
      z.object({
        kind: z.enum(KINDS),
        key: z.string().min(1).max(200),
        value: z.record(z.string(), z.unknown()).nullable(),
        expectedVersion: z.number().int().nonnegative().optional(),
        previous: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .max(10000),
});
const prefix = (userId: string) => `fitnutricion-sync-inbox-v1:${userId}:`;
let lastSequence = 0;
/** A separate synchronous key per mutation batch avoids cross-tab read/modify/write races. */
export function stageChanges(
  userId: string,
  changes: Change[],
  storage: Storage = localStorage,
): void {
  const batch = { id: generateUuid(), changes };
  lastSequence = Math.max(lastSequence + 1, Date.now());
  storage.setItem(
    prefix(userId) + String(lastSequence).padStart(16, '0') + ':' + batch.id,
    JSON.stringify(batch),
  );
}
export async function recoverInbox(
  userId: string,
  engine: SyncEngine,
  storage: Storage = localStorage,
): Promise<void> {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
    .filter((key): key is string => !!key?.startsWith(prefix(userId)))
    .sort();
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const batch = batchSchema.parse(JSON.parse(raw));
    if (!key.endsWith(':' + batch.id)) throw new Error('Identificador de cola inválido.');
    await engine.enqueueBatch(batch.id, batch.changes);
    storage.removeItem(key);
    // Keep the receipt until every tab has finished replaying this batch.
    // Receipts are small IDs; retention is explicit, not a time-based guess.
  }
}
