import { useState } from 'react';
import { exportUserData } from '../../services/exportData';
import { useAuthStore } from '../../store/useAuthStore';
import { useSyncStatusStore } from '../../store/useSyncStatusStore';
export function AccountActions() {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useSyncStatusStore((s) => s.pendingOperations);
  async function leave(wipe: boolean) {
    if (
      wipe &&
      !window.confirm(
        `Se borrarán los datos de esta cuenta en este dispositivo. ${pending ? 'Hay cambios pendientes que podrían perderse. ' : ''}Esto no elimina la cuenta ni los datos del servidor. ¿Continuar?`,
      )
    )
      return;
    setBusy(true);
    try {
      await useAuthStore.getState().logout(wipe);
    } catch {
      setError(
        'No se pudo completar la salida o el borrado. Reintenta antes de dejar el dispositivo.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-3 px-4 py-2 text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          try {
            const user = useAuthStore.getState().currentUser;
            if (user) await exportUserData(user.id);
          } catch {
            setError('No se pudo exportar la copia local.');
          }
        }}
      >
        Exportar mis datos (sin cifrar)
      </button>
      <button type="button" disabled={busy} onClick={() => void leave(false)}>
        Cerrar sesión
      </button>
      <button type="button" disabled={busy} className="underline" onClick={() => void leave(true)}>
        Salir y borrar datos del dispositivo
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
