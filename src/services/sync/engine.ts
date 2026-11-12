import { generateUuid } from '../../lib/ids';
export const KINDS = [
  'profile',
  'biometric',
  'food',
  'recipe',
  'exercise',
  'timeline',
  'checkin',
  'routine',
  'session',
  'preferences',
] as const;
export type EntityKind = (typeof KINDS)[number];
export interface Document {
  kind: EntityKind;
  key: string;
  value: Record<string, unknown> | null;
  version: number;
}
export interface Change {
  kind: EntityKind;
  key: string;
  value: Record<string, unknown> | null;
  expectedVersion?: number;
  previous?: Record<string, unknown> | null;
}
export interface Operation extends Change {
  id: string;
  baseVersion: number;
  attempts: number;
  retryAt: number;
  conflict?: Document;
  localPredecessorId?: string;
}
export interface Journal {
  schema: 1;
  imported: boolean;
  acceptedBatches?: string[];
  documents: Record<string, Document>;
  operations: Operation[];
}
export interface JournalStorage {
  transaction<T>(work: (journal: Journal) => Promise<T>): Promise<T>;
}
export interface SyncGateway {
  pull(): Promise<Document[]>;
  push(op: Operation): Promise<{ status: 'applied' | 'conflict'; document: Document }>;
}
export const documentId = (entry: Pick<Change, 'kind' | 'key'>): string =>
  `${entry.kind}:${entry.key}`;
export const emptyJournal = (): Journal => ({
  schema: 1,
  imported: false,
  documents: {},
  operations: [],
});
export function materialize(journal: Journal): Document[] {
  const result = new Map(Object.entries(journal.documents));
  for (const op of journal.operations)
    result.set(documentId(op), {
      kind: op.kind,
      key: op.key,
      value: op.value,
      version: op.baseVersion,
    });
  return [...result.values()];
}
export function sameValue(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
/** Operation IDs survive response loss. Nothing is acknowledged before durable storage. */
export class SyncEngine {
  constructor(
    private storage: JournalStorage,
    private gateway: SyncGateway,
    private now: () => number = Date.now,
  ) {}
  async read(): Promise<Journal> {
    return this.storage.transaction(async (j) => structuredClone(j));
  }
  async enqueue(changes: Change[]): Promise<void> {
    return this.enqueueBatch(generateUuid(), changes);
  }
  async enqueueBatch(batchId: string, changes: Change[]): Promise<void> {
    await this.storage.transaction(async (j) => {
      if (j.acceptedBatches?.includes(batchId)) return;
      j.acceptedBatches = [...(j.acceptedBatches ?? []), batchId];
      for (const change of changes) {
        const key = documentId(change);
        const previous = [...j.operations].reverse().find((op) => documentId(op) === key);
        if (previous && sameValue(previous.value, change.value)) continue;
        const baseVersion = previous
          ? previous.baseVersion + 1
          : (change.expectedVersion ?? j.documents[key]?.version ?? 0);
        const conflict =
          previous && change.previous !== undefined && !sameValue(previous.value, change.previous)
            ? {
                kind: previous.kind,
                key: previous.key,
                value: previous.value,
                version: baseVersion,
              }
            : undefined;
        j.operations.push({
          ...structuredClone(change),
          id: generateUuid(),
          baseVersion,
          attempts: 0,
          retryAt: 0,
          conflict,
          localPredecessorId: conflict ? previous?.id : undefined,
        });
      }
    });
  }
  async bootstrap(legacy: Change[]): Promise<void> {
    const remote = await this.gateway.pull();
    await this.storage.transaction(async (j) => {
      if (j.imported) return;
      for (const doc of remote) j.documents[documentId(doc)] = doc;
      for (const change of legacy) {
        const previous = [...j.operations]
          .reverse()
          .find((op) => documentId(op) === documentId(change));
        const current = previous
          ? {
              kind: previous.kind,
              key: previous.key,
              value: previous.value,
              version: previous.baseVersion + 1,
            }
          : j.documents[documentId(change)];
        if (current?.value === null || (current && sameValue(current.value, change.value)))
          continue;
        const op: Operation = {
          ...structuredClone(change),
          id: generateUuid(),
          baseVersion: 0,
          attempts: 0,
          retryAt: 0,
        };
        if (current) {
          op.conflict = current;
          op.localPredecessorId = previous?.id;
        }
        j.operations.push(op);
      }
      j.imported = true;
    });
  }
  async synchronize(force = false): Promise<Journal> {
    return this.storage.transaction(async (j) => {
      for (const doc of await this.gateway.pull()) {
        const key = documentId(doc);
        if (doc.version >= (j.documents[key]?.version ?? 0)) j.documents[key] = doc;
      }
      const blocked = new Set<string>();
      for (const op of [...j.operations]) {
        const key = documentId(op);
        if (blocked.has(key)) continue;
        if (
          op.localPredecessorId &&
          !j.operations.some((other) => other.id === op.localPredecessorId)
        )
          delete op.localPredecessorId;
        if (op.conflict && !op.localPredecessorId && j.documents[key])
          op.conflict = j.documents[key];
        if (op.conflict || (!force && op.retryAt > this.now())) {
          blocked.add(key);
          continue;
        }
        try {
          const response = await this.gateway.push(structuredClone(op));
          if (response.document.version >= (j.documents[key]?.version ?? 0))
            j.documents[key] = response.document;
          if (response.status === 'conflict') {
            op.conflict = response.document;
            blocked.add(key);
          } else j.operations = j.operations.filter((candidate) => candidate.id !== op.id);
        } catch {
          op.attempts += 1;
          op.retryAt = this.now() + Math.min(300_000, 1000 * 2 ** Math.min(op.attempts, 8));
          blocked.add(key);
        }
      }
      return structuredClone(j);
    });
  }
  async resolve(id: string, choice: 'local' | 'remote'): Promise<void> {
    await this.storage.transaction(async (j) => {
      const conflict = j.operations.find((op) => op.id === id && op.conflict);
      if (!conflict?.conflict) return;
      const key = documentId(conflict);
      const chain = j.operations.filter((op) => documentId(op) === key);
      const desired = chain[chain.length - 1];
      const index = chain.findIndex((op) => op.id === id);
      if (
        conflict.localPredecessorId &&
        chain.some((op) => op.id === conflict.localPredecessorId)
      ) {
        const earlier = chain.slice(0, index);
        j.operations = j.operations.filter((op) => documentId(op) !== key);
        j.operations.push(...earlier);
        if (choice === 'local')
          j.operations.push({
            kind: desired.kind,
            key: desired.key,
            value: desired.value,
            id: generateUuid(),
            baseVersion: earlier[earlier.length - 1].baseVersion + 1,
            attempts: 0,
            retryAt: 0,
          });
        return;
      }
      j.operations = j.operations.filter((op) => documentId(op) !== key);
      j.documents[key] = conflict.conflict;
      if (choice === 'local')
        j.operations.push({
          kind: desired.kind,
          key: desired.key,
          value: desired.value,
          id: generateUuid(),
          baseVersion: conflict.conflict.version,
          attempts: 0,
          retryAt: 0,
        });
    });
  }
}
