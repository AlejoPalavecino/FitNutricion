import type { SupabaseClient } from '@supabase/supabase-js';
import { reportCloudFailure, useSyncStatusStore } from '../store/useSyncStatusStore';
import { supabase } from './supabaseClient';

export type SyncResult = { status: 'local' | 'synced' } | { status: 'error'; message: string };
export async function cloudWrite(
  userId: string,
  task: (client: SupabaseClient) => Promise<void>,
): Promise<SyncResult> {
  if (!supabase) return { status: 'local' };
  useSyncStatusStore.setState((state) => ({ pendingWrites: state.pendingWrites + 1 }));
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new Error('Invalid owner');
    }
    await task(supabase);
    useSyncStatusStore.setState({ lastSyncedAt: new Date().toISOString() });
    return { status: 'synced' };
  } catch {
    reportCloudFailure();
    return { status: 'error', message: 'No se pudo confirmar la escritura remota.' };
  } finally {
    useSyncStatusStore.setState((state) => ({
      pendingWrites: Math.max(0, state.pendingWrites - 1),
    }));
  }
}
