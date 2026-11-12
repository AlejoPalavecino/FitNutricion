import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ExerciseCatalogItem, WorkoutSession } from '../../types/nutrition';
import { useDialogFocus } from '../useDialogFocus';
interface Props {
  detailModalExercise: ExerciseCatalogItem | null;
  detailModalTab: 'demo' | 'history';
  setDetailModalExercise: (exercise: ExerciseCatalogItem | null) => void;
  setDetailModalTab: (tab: 'demo' | 'history') => void;
  workoutSessions: WorkoutSession[];
}
export function ExerciseDetailDialog({
  detailModalExercise,
  detailModalTab,
  setDetailModalExercise,
  setDetailModalTab,
  workoutSessions,
}: Props) {
  const dialogRef = useDialogFocus(!!detailModalExercise, () => setDetailModalExercise(null));
  return (
    <>
      <AnimatePresence>
        {detailModalExercise && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
            onClick={() => setDetailModalExercise(null)}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={detailModalExercise.nameEs}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                    {detailModalExercise.primaryMuscle} · {detailModalExercise.equipment}
                  </span>
                  <h3 className="mt-2 text-xl font-extrabold text-slate-900">
                    {detailModalExercise.nameEs}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar detalle del ejercicio"
                  onClick={() => setDetailModalExercise(null)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Pestañas del modal */}
              <div className="mt-4 flex gap-2 border-b border-slate-100 pb-3">
                {(
                  [
                    { id: 'demo', label: 'Cómo se hace' },
                    { id: 'history', label: 'Tus entrenamientos anteriores' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailModalTab(t.id)}
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                      detailModalTab === t.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {detailModalTab === 'demo' && (
                <div className="mt-5 space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                      <img
                        src={detailModalExercise.images[1]}
                        alt={detailModalExercise.nameEs}
                        className="mx-auto h-52 object-contain"
                      />
                      <span className="mt-2 block text-xs font-semibold text-slate-500">
                        Movimiento paso a paso
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                      <img
                        src={detailModalExercise.images[0]}
                        alt={detailModalExercise.nameEs}
                        className="mx-auto h-52 object-contain"
                      />
                      <span className="mt-2 block text-xs font-semibold text-slate-500">
                        Posición inicial
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">
                      Instrucciones sencillas:
                    </h4>
                    <ol className="mt-3 space-y-2.5 text-sm text-slate-700">
                      {detailModalExercise.instructionsEs.map((step, i) => (
                        <li
                          key={i}
                          className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {detailModalTab === 'history' && (
                <div className="mt-5 space-y-3">
                  {workoutSessions.filter((s) =>
                    s.sets.some((st) => st.exerciseId === detailModalExercise.id),
                  ).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                      Aún no tienes entrenamientos registrados con este ejercicio.
                    </div>
                  ) : (
                    workoutSessions
                      .filter((s) => s.sets.some((st) => st.exerciseId === detailModalExercise.id))
                      .map((sess) => {
                        const exSets = sess.sets.filter(
                          (st) => st.exerciseId === detailModalExercise.id,
                        );
                        return (
                          <div
                            key={sess.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm"
                          >
                            <div className="flex justify-between font-bold text-slate-900">
                              <span>{sess.routineName}</span>
                              <span className="text-xs text-slate-500">{sess.date}</span>
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {exSets.map((st) => (
                                <span
                                  key={st.id}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                                >
                                  {st.weightKg} kg × {st.reps} reps
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
