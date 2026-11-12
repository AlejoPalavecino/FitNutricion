import { AnimatePresence, motion } from 'framer-motion';
import { SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNutritionStore } from '../../store/useNutritionStore';
function playRestTimerBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => {
      void ctx.close();
    };
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([180, 80, 180]);
    }
  } catch {
    // Ignorar si el navegador bloquea audio sin interacción previa
  }
}

export const startRestTimer = (seconds: number, exName: string) => {
  const endsAt = Date.now() + seconds * 1000;

  useNutritionStore.getState().setActiveWorkoutDraft((prev) =>
    prev
      ? {
          ...prev,
          restTimerEndsAtMs: endsAt,
          restTimerTotalSeconds: seconds,
          restTimerExerciseName: exName,
          updatedAt: new Date().toISOString(),
        }
      : null,
  );
};

export function RestTimer() {
  const activeWorkoutDraft = useNutritionStore((s) => s.activeWorkoutDraft);
  const setActiveWorkoutDraft = useNutritionStore((s) => s.setActiveWorkoutDraft);
  // Temporizador de descanso basado en timestamp real (no se pierde al cambiar de pestaña ni al bloquear el celular)
  const restTimerEndsAtMs = activeWorkoutDraft?.restTimerEndsAtMs ?? null;
  const restTimerTotal = activeWorkoutDraft?.restTimerTotalSeconds ?? 120;
  const restTimerExerciseName = activeWorkoutDraft?.restTimerExerciseName ?? '';

  const [restTimerRemaining, setRestTimerRemaining] = useState<number>(() => {
    if (!restTimerEndsAtMs) return 0;
    return Math.max(0, Math.ceil((restTimerEndsAtMs - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!restTimerEndsAtMs) {
      setRestTimerRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const diffSec = Math.max(0, Math.ceil((restTimerEndsAtMs - Date.now()) / 1000));
      setRestTimerRemaining(diffSec);
      if (diffSec <= 0) {
        playRestTimerBeep();
        setActiveWorkoutDraft((prev) => (prev ? { ...prev, restTimerEndsAtMs: null } : null));
      }
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 500);
    return () => window.clearInterval(timer);
  }, [restTimerEndsAtMs, setActiveWorkoutDraft]);

  const adjustRestTimer = (deltaSeconds: number) => {
    setActiveWorkoutDraft((prev) => {
      if (!prev || !prev.restTimerEndsAtMs) return prev;
      const nextEndsAt = prev.restTimerEndsAtMs + deltaSeconds * 1000;
      if (nextEndsAt <= Date.now()) {
        return { ...prev, restTimerEndsAtMs: null };
      }
      return {
        ...prev,
        restTimerEndsAtMs: nextEndsAt,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const stopRestTimer = () => {
    setRestTimerRemaining(0);
    setActiveWorkoutDraft((prev) => (prev ? { ...prev, restTimerEndsAtMs: null } : null));
  };

  const isRestTimerActive = Boolean(restTimerEndsAtMs && restTimerRemaining > 0);

  return (
    <>
      {/* ====================================================================
          BARRA FLOTANTE: TEMPORIZADOR DE DESCANSO
         ==================================================================== */}
      <AnimatePresence>
        {(isRestTimerActive || restTimerRemaining > 0) && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed right-4 bottom-4 left-4 z-40 mx-auto max-w-xl rounded-3xl border border-emerald-300 bg-white p-4 shadow-xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-extrabold text-white">
                  {Math.floor(restTimerRemaining / 60)}:
                  {String(restTimerRemaining % 60).padStart(2, '0')}
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">Tiempo de descanso</div>
                  <div className="text-xs font-medium text-slate-500">
                    {restTimerExerciseName} · Meta {restTimerTotal} seg
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustRestTimer(-15)}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  -15s
                </button>
                <button
                  type="button"
                  onClick={() => adjustRestTimer(15)}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  +15s
                </button>
                <button
                  type="button"
                  onClick={stopRestTimer}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>Listo</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
