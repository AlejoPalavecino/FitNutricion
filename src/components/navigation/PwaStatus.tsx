import { useEffect, useRef, useState } from 'react';
import { useNutritionStore } from '../../store/useNutritionStore';
export function PwaStatus() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    [notice, setNotice] = useState('');
  const accepting = useRef(false);
  const activeWorkout = useNutritionStore(
    (s) =>
      !!s.activeWorkoutDraft &&
      Object.values(s.activeWorkoutDraft.setsByExercise).some((sets) =>
        sets.some((set) => set.isCompleted),
      ),
  );
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let alive = true;
    let registration: ServiceWorkerRegistration | undefined;
    const check = () => {
      if (alive && navigator.serviceWorker.controller && registration?.waiting)
        setWaiting(registration.waiting);
    };
    const change = () => {
      if (accepting.current) window.location.reload();
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'UPDATE_BLOCKED') {
        accepting.current = false;
        setNotice('Cierra las otras pestañas de FitNutrición antes de actualizar.');
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', change);
    navigator.serviceWorker.addEventListener('message', message);
    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((r) => {
        registration = r;
        check();
        r.addEventListener('updatefound', () =>
          r.installing?.addEventListener('statechange', check),
        );
      })
      .catch(() => {
        if (alive)
          setNotice(
            'No se pudo preparar la apertura sin conexión. Tus datos locales no se borraron.',
          );
      });
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener('controllerchange', change);
      navigator.serviceWorker.removeEventListener('message', message);
    };
  }, []);
  if (!waiting && !notice) return null;
  return (
    <aside className="border-b bg-amber-50 p-3 text-sm" role="status">
      {notice || 'Hay una versión nueva disponible.'}
      {waiting && (
        <button
          type="button"
          disabled={!!activeWorkout}
          className="ml-3 underline"
          onClick={() => {
            accepting.current = true;
            waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
          }}
        >
          Actualizar y recargar
        </button>
      )}
      {waiting && activeWorkout && (
        <span> Finaliza o guarda tu entrenamiento antes de actualizar.</span>
      )}
    </aside>
  );
}
