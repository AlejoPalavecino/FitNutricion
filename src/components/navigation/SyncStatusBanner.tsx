import { isSupabaseConfigured } from '../../services/supabaseClient';
import { useSyncStatusStore } from '../../store/useSyncStatusStore';

export function SyncStatusBanner() {
  const state = useSyncStatusStore();
  const message = state.localError ?? state.lastError ?? (
    state.conflicts > 0 ? `${state.conflicts} cambios en conflicto requieren revisión.` :
    state.pendingWrites > 0 || state.pendingOperations > 0 ? 'Guardado localmente. Sincronización pendiente…' :
    !isSupabaseConfigured() ? 'Modo local: los datos permanecen sin cifrar en este navegador.' :
    state.lastSyncedAt ? 'Cambios confirmados por el servidor.' : 'Modo nube configurado. Aún no hay una sincronización confirmada.'
  );
  return <div role={state.localError || state.lastError ? 'alert' : 'status'} aria-live="polite"
    className="mx-auto max-w-6xl px-4 py-2 text-xs text-slate-700">{message}</div>;
}
