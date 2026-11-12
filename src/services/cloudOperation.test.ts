import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncStatusStore } from '../store/useSyncStatusStore';
import { cloudWrite } from './cloudOperation';
vi.mock('./supabaseClient', () => ({ supabase: {} }));
describe('explicit cloud outcomes', () => {
  beforeEach(() => useSyncStatusStore.getState().reset());
  it('reports a rejected query without exposing database details or claiming success', async () => {
    const result = await cloudWrite('11111111-1111-4111-8111-111111111111', async () => {
      throw new Error('private row');
    });
    expect(result.status).toBe('error');
    expect(useSyncStatusStore.getState().lastError).not.toContain('private row');
    expect(useSyncStatusStore.getState().lastSyncedAt).toBeNull();
    expect(useSyncStatusStore.getState().pendingWrites).toBe(0);
  });
});
