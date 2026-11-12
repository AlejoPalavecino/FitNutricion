import { create } from 'zustand';

interface SyncStatusState {
  pendingWrites: number;
  pendingOperations: number;
  conflicts: number;
  conflictItems: Array<{ id: string; kind: string; key: string }>;
  lastSyncedAt: string | null;
  lastError: string | null;
  localError: string | null;
  reset: () => void;
}
const initial = {
  conflictItems: [] as Array<{ id: string; kind: string; key: string }>,
  pendingWrites: 0,
  pendingOperations: 0,
  conflicts: 0,
  lastSyncedAt: null,
  lastError: null,
  localError: null,
};
export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  ...initial,
  reset: () => set(initial),
}));
export function reportCloudFailure(): void {
  useSyncStatusStore.setState({
    lastError:
      'No se pudo sincronizar. Tus cambios locales siguen en el dispositivo; no borres sus datos.',
  });
}
export function reportLocalFailure(): void {
  useSyncStatusStore.setState({
    localError:
      'No se pudo guardar en este dispositivo. No cierres la aplicación: libera espacio y vuelve a intentarlo.',
  });
}
