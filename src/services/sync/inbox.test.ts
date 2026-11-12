import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncEngine, emptyJournal, type JournalStorage } from './engine';
import { recoverInbox, stageChanges } from './inbox';
function storage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    clear: () => data.clear(),
  } satisfies Storage;
}
function engine() {
  const j = emptyJournal();
  const store: JournalStorage = {
    async transaction(work) {
      return work(j);
    },
  };
  return new SyncEngine(store, {
    pull: async () => [],
    push: async () => {
      throw new Error('offline');
    },
  });
}
const change = (name: string) => ({ kind: 'food' as const, key: 'same', value: { name } });
afterEach(() => vi.restoreAllMocks());
describe('crash-safe synchronous inbox', () => {
  it('recovers edits made before async journal persistence could run', async () => {
    const disk = storage(),
      e = engine();
    stageChanges('A', [change('first')], disk);
    stageChanges('A', [change('second')], disk);
    expect(disk.length).toBe(2);
    await recoverInbox('A', e, disk);
    expect((await e.read()).operations.map((o) => o.value?.name)).toEqual(['first', 'second']);
    expect(disk.length).toBe(0);
  });
  it('does not duplicate a batch after a crash between journal commit and inbox deletion', async () => {
    const disk = storage(),
      e = engine();
    stageChanges('A', [change('one')], disk);
    const real = disk.removeItem;
    disk.removeItem = () => {
      throw new Error('crash');
    };
    await expect(recoverInbox('A', e, disk)).rejects.toThrow();
    disk.removeItem = real;
    await recoverInbox('A', e, disk);
    expect((await e.read()).operations).toHaveLength(1);
  });
  it('never drains another account inbox', async () => {
    const disk = storage(),
      e = engine();
    stageChanges('A', [change('A')], disk);
    stageChanges('B', [change('B')], disk);
    await recoverInbox('A', e, disk);
    expect(disk.length).toBe(1);
    expect((await e.read()).operations[0].value?.name).toBe('A');
  });
  it('reports storage quota failures synchronously', () => {
    const disk = storage();
    disk.setItem = () => {
      throw new Error('quota');
    };
    expect(() => stageChanges('A', [change('A')], disk)).toThrow('quota');
  });
  it('keeps invalid inbox contents for diagnosis instead of discarding them', async () => {
    const disk = storage(),
      e = engine();
    disk.setItem('fitnutricion-sync-inbox-v1:A:bad', 'not-json');
    await expect(recoverInbox('A', e, disk)).rejects.toThrow();
    expect(disk.length).toBe(1);
  });
});
