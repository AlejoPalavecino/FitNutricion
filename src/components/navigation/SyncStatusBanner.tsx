import { cloudSyncService } from '../../services/cloudSyncService';
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
    className="mx-auto max-w-6xl px-4 py-2 text-xs text-slate-700">{message}
    {state.pendingOperations > 0 && <button type="button" className="ml-3 underline" onClick={() => void cloudSyncService.retry()}>Reintentar</button>}
    {state.conflictItems.map((item) => <div key={item.id} className="mt-2 rounded border p-2">
      <span>Conflicto en {item.kind}. La copia local se conserva hasta que elijas.</span>
      <button type="button" className="ml-3 underline" onClick={() => { if (window.confirm('¿Reemplazar este registro remoto por tu copia local?')) void cloudSyncService.resolveConflict(item.id, 'local'); }}>Conservar mi cambio</button>
      <button type="button" className="ml-3 underline" onClick={() => { if (window.confirm('¿Descartar tu cambio pendiente y usar la versión del servidor?')) void cloudSyncService.resolveConflict(item.id, 'remote'); }}>Usar versión del servidor</button>
    </div>)}
  </div>;
}
