import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Award,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Layers,
  Pause,
  Play,
  Plus,
  Search,
  SkipForward,
  Sparkles,
  Trash2,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  EquipmentEs,
  ExerciseCatalogItem,
  MuscleGroupEs,
  WorkoutRoutine,
  WorkoutRoutineExercise,
  WorkoutSetLog,
  WorkoutSetType,
} from '../../types/nutrition';
import {
  calculateEstimated1RM,
  calculateSessionTonnageKg,
  calculateWeeklyMuscleVolume,
  evaluateStrengthBodyweightSynergy,
  getDoubleProgressionSuggestion,
  getHistoricalExerciseBest,
} from '../../lib/strengthAnalytics';
import { useNutritionStore } from '../../store/useNutritionStore';

const QUICK_MUSCLE_CHIPS: Array<{ label: string; value: MuscleGroupEs | 'ALL' }> = [
  { label: 'Todos', value: 'ALL' },
  { label: 'Pecho', value: 'Pecho' },
  { label: 'Espalda', value: 'Espalda / Dorsales' },
  { label: 'Cuádriceps', value: 'Cuádriceps' },
  { label: 'Glúteos', value: 'Glúteos' },
  { label: 'Isquios', value: 'Isquiotibiales' },
  { label: 'Hombros', value: 'Hombros (Deltoides)' },
  { label: 'Bíceps', value: 'Bíceps' },
  { label: 'Tríceps', value: 'Tríceps' },
  { label: 'Abdominales', value: 'Abdominales / Core' },
];

const EQUIPMENT_CHIPS: Array<EquipmentEs | 'ALL'> = [
  'ALL',
  'Barra',
  'Mancuerna',
  'Polea',
  'Máquina',
  'Peso Corporal',
  'Pesa Rusa (Kettlebell)',
  'Máquina Smith (Multipower)',
  'Barra Z',
];

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const SET_TYPE_Order: WorkoutSetType[] = ['working', 'warmup'];

/**
 * Emite un sonido suave al terminar el descanso.
 */
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
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([180, 80, 180]);
    }
  } catch {
    // Ignorar si el navegador bloquea audio sin interacción previa
  }
}

export const OpenGymHub: React.FC = () => {
  const userProfile = useNutritionStore((s) => s.userProfile);
  const biometricLogs = useNutritionStore((s) => s.biometricLogs);
  const exerciseCatalog = useNutritionStore((s) => s.exerciseCatalog);
  const workoutRoutines = useNutritionStore((s) => s.workoutRoutines);
  const workoutSessions = useNutritionStore((s) => s.workoutSessions);
  const selectedDate = useNutritionStore((s) => s.selectedDate);
  const saveWorkoutRoutine = useNutritionStore((s) => s.saveWorkoutRoutine);
  const addExerciseToRoutine = useNutritionStore((s) => s.addExerciseToRoutine);
  const logWorkoutSession = useNutritionStore((s) => s.logWorkoutSession);

  const [subTab, setSubTab] = useState<
    'active_workout' | 'catalog' | 'routines' | 'analytics'
  >('active_workout');

  const catalogMap = useMemo(
    () => new Map(exerciseCatalog.map((e) => [e.id, e])),
    [exerciseCatalog]
  );

  // ==========================================================================
  // ESTADO 1: ENTRENAR HOY
  // ==========================================================================
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>(
    workoutRoutines[0]?.id ?? 'routine-push-heavy'
  );
  const activeRoutine = useMemo(
    () =>
      workoutRoutines.find((r) => r.id === selectedRoutineId) ?? workoutRoutines[0],
    [workoutRoutines, selectedRoutineId]
  );

  const [activeSetsByExercise, setActiveSetsByExercise] = useState<
    Record<string, WorkoutSetLog[]>
  >({});
  const [sessionSavedBanner, setSessionSavedBanner] = useState<string | null>(null);
  const [sessionStartedAt] = useState<Date>(() => new Date());
  const [quickAddExerciseId, setQuickAddExerciseId] = useState<string>(
    exerciseCatalog[0]?.id ?? 'og-0025'
  );

  useEffect(() => {
    if (!activeRoutine) return;
    setActiveSetsByExercise((prev) => {
      const nextMap: Record<string, WorkoutSetLog[]> = {};

      for (const rEx of activeRoutine.exercises) {
        if (prev[rEx.exerciseId] && prev[rEx.exerciseId].length > 0) {
          nextMap[rEx.exerciseId] = prev[rEx.exerciseId];
          continue;
        }
        const catItem = catalogMap.get(rEx.exerciseId);
        const progPlan = getDoubleProgressionSuggestion({
          routineExercise: rEx,
          catalogItem: catItem,
          previousSessions: workoutSessions,
        });

        nextMap[rEx.exerciseId] = progPlan.setSuggestions.map((sug, idx) => ({
          id: `live-${rEx.exerciseId}-${idx + 1}`,
          exerciseId: rEx.exerciseId,
          setNumber: idx + 1,
          setType: 'working',
          weightKg: sug.suggestedWeightKg,
          reps: sug.suggestedReps,
          rir: rEx.targetRir,
          isCompleted: false,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(
            sug.suggestedWeightKg,
            sug.suggestedReps,
            'working'
          ),
        }));
      }

      return nextMap;
    });
  }, [activeRoutine?.id, activeRoutine?.exercises.length, catalogMap, workoutSessions]);

  // Temporizador de descanso
  const [restTimerRemaining, setRestTimerRemaining] = useState<number>(0);
  const [restTimerTotal, setRestTimerTotal] = useState<number>(120);
  const [restTimerExerciseName, setRestTimerExerciseName] = useState<string>('');
  const [isRestTimerActive, setIsRestTimerActive] = useState<boolean>(false);

  useEffect(() => {
    if (!isRestTimerActive || restTimerRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setRestTimerRemaining((prev) => {
        if (prev <= 1) {
          setIsRestTimerActive(false);
          playRestTimerBeep();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRestTimerActive, restTimerRemaining]);

  const startRestTimer = (seconds: number, exName: string) => {
    setRestTimerTotal(seconds);
    setRestTimerRemaining(seconds);
    setRestTimerExerciseName(exName);
    setIsRestTimerActive(true);
  };

  const handleCycleSetType = (exerciseId: string, setId: string) => {
    setActiveSetsByExercise((prev) => {
      const list = prev[exerciseId] ?? [];
      return {
        ...prev,
        [exerciseId]: list.map((s) => {
          if (s.id !== setId) return s;
          const nextIdx =
            (SET_TYPE_Order.indexOf(s.setType) + 1) % SET_TYPE_Order.length;
          const nextType = SET_TYPE_Order[nextIdx];
          const next1RM = calculateEstimated1RM(s.weightKg, s.reps, nextType);
          return {
            ...s,
            setType: nextType,
            estimated1RM: next1RM,
            isPrWeight: false,
            isPr1RM: false,
          };
        }),
      };
    });
  };

  const handleUpdateSetField = (
    exerciseId: string,
    setId: string,
    field: 'weightKg' | 'reps',
    value: number
  ) => {
    setActiveSetsByExercise((prev) => {
      const list = prev[exerciseId] ?? [];
      return {
        ...prev,
        [exerciseId]: list.map((s) => {
          if (s.id !== setId) return s;
          const updated = { ...s, [field]: value };
          updated.estimated1RM = calculateEstimated1RM(
            updated.weightKg,
            updated.reps,
            updated.setType
          );
          const bestHist = getHistoricalExerciseBest(exerciseId, workoutSessions);
          const isEffective = updated.isCompleted && updated.setType !== 'warmup';
          updated.isPrWeight = isEffective && updated.weightKg > bestHist.maxWeightKg;
          updated.isPr1RM = isEffective && updated.estimated1RM > bestHist.max1RMKg;
          return updated;
        }),
      };
    });
  };

  const handleToggleCompleteSet = (
    exerciseId: string,
    setId: string,
    restSeconds: number,
    exNameEs: string
  ) => {
    setActiveSetsByExercise((prev) => {
      const list = prev[exerciseId] ?? [];
      return {
        ...prev,
        [exerciseId]: list.map((s) => {
          if (s.id !== setId) return s;
          const nextCompleted = !s.isCompleted;
          const est1RM = calculateEstimated1RM(s.weightKg, s.reps, s.setType);
          const bestHist = getHistoricalExerciseBest(exerciseId, workoutSessions);
          const isEffective = nextCompleted && s.setType !== 'warmup';
          const isPrWeight = isEffective && s.weightKg > bestHist.maxWeightKg;
          const isPr1RM = isEffective && est1RM > bestHist.max1RMKg;

          if (nextCompleted) {
            startRestTimer(restSeconds, exNameEs);
          }

          return {
            ...s,
            isCompleted: nextCompleted,
            estimated1RM: est1RM,
            isPrWeight,
            isPr1RM,
          };
        }),
      };
    });
  };

  const handleAddSetToExercise = (exerciseId: string) => {
    setActiveSetsByExercise((prev) => {
      const list = prev[exerciseId] ?? [];
      const last = list[list.length - 1];
      const newSetNumber = list.length + 1;
      const weightKg = last?.weightKg ?? 60;
      const reps = last?.reps ?? 10;
      const newSet: WorkoutSetLog = {
        id: `live-${exerciseId}-${Date.now()}`,
        exerciseId,
        setNumber: newSetNumber,
        setType: 'working',
        weightKg,
        reps,
        rir: last?.rir ?? 1,
        isCompleted: false,
        isPrWeight: false,
        isPr1RM: false,
        estimated1RM: calculateEstimated1RM(weightKg, reps, 'working'),
      };
      return {
        ...prev,
        [exerciseId]: [...list, newSet],
      };
    });
  };

  const allCurrentSessionSets = useMemo(
    () => Object.values(activeSetsByExercise).flat(),
    [activeSetsByExercise]
  );

  const liveSessionTonnageKg = useMemo(
    () => calculateSessionTonnageKg(allCurrentSessionSets),
    [allCurrentSessionSets]
  );

  const completedSetsCount = useMemo(
    () => allCurrentSessionSets.filter((s) => s.isCompleted).length,
    [allCurrentSessionSets]
  );

  const handleFinishAndSaveWorkout = () => {
    const completed = allCurrentSessionSets.filter((s) => s.isCompleted);
    if (completed.length === 0) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const startTimeStr = `${pad(sessionStartedAt.getHours())}:${pad(
      sessionStartedAt.getMinutes()
    )}`;
    const endTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const elapsedMin = Math.max(
      15,
      Math.round((now.getTime() - sessionStartedAt.getTime()) / 60000) || 45
    );

    const saved = logWorkoutSession({
      routineId: activeRoutine?.id,
      routineName: activeRoutine?.name ?? 'Entrenamiento',
      date: selectedDate,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationMinutes: elapsedMin,
      sets: completed,
    });

    setSessionSavedBanner(
      `¡Entrenamiento guardado! Completaste ${completed.length} series hoy (${saved.totalVolumeKg.toLocaleString()} kg movidos en total).`
    );
  };

  // ==========================================================================
  // ESTADO 2: CATÁLOGO DE EJERCICIOS
  // ==========================================================================
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState<
    MuscleGroupEs | 'ALL'
  >('ALL');
  const [selectedEquipmentFilter, setSelectedEquipmentFilter] = useState<
    EquipmentEs | 'ALL'
  >('ALL');
  const [detailModalExercise, setDetailModalExercise] =
    useState<ExerciseCatalogItem | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'demo' | 'history'>('demo');
  const [animatedPreviewIds, setAnimatedPreviewIds] = useState<
    Record<string, boolean>
  >({});

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exerciseCatalog.filter((ex) => {
      if (
        selectedMuscleFilter !== 'ALL' &&
        ex.primaryMuscle !== selectedMuscleFilter &&
        !ex.secondaryMuscles.includes(selectedMuscleFilter)
      ) {
        return false;
      }
      if (
        selectedEquipmentFilter !== 'ALL' &&
        ex.equipment !== selectedEquipmentFilter
      ) {
        return false;
      }
      if (!q) return true;
      const inEs = ex.nameEs.toLowerCase().includes(q);
      const inEn = ex.nameEn.toLowerCase().includes(q);
      const inAliases = ex.aliases.some((a) => a.toLowerCase().includes(q));
      const inMuscle = ex.primaryMuscle.toLowerCase().includes(q);
      return inEs || inEn || inAliases || inMuscle;
    });
  }, [
    exerciseCatalog,
    searchQuery,
    selectedMuscleFilter,
    selectedEquipmentFilter,
  ]);

  // ==========================================================================
  // ESTADO 3: MIS RUTINAS
  // ==========================================================================
  const [editingRoutine, setEditingRoutine] = useState<WorkoutRoutine>(
    () => workoutRoutines[0] ?? INITIAL_ROUTINE_FALLBACK
  );
  const [exerciseToAddId, setExerciseToAddId] = useState<string>(
    exerciseCatalog[0]?.id ?? 'og-0025'
  );
  const [routineSavedToast, setRoutineSavedToast] = useState<string | null>(null);

  const handleMoveRoutineExercise = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= editingRoutine.exercises.length) return;
    const copy = [...editingRoutine.exercises];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    const reordered = copy.map((item, i) => ({ ...item, order: i + 1 }));
    setEditingRoutine({ ...editingRoutine, exercises: reordered });
  };

  // ==========================================================================
  // ESTADO 4: MI PROGRESO
  // ==========================================================================
  const weeklyMuscleVolume = useMemo(
    () =>
      calculateWeeklyMuscleVolume({
        sessions: workoutSessions,
        catalog: exerciseCatalog,
      }),
    [workoutSessions, exerciseCatalog]
  );

  const [synergyExerciseId, setSynergyExerciseId] = useState<string>('og-0043');
  const synergyReport = useMemo(
    () =>
      evaluateStrengthBodyweightSynergy({
        exerciseId: synergyExerciseId,
        biometricLogs,
        workoutSessions,
        currentPhase: userProfile?.currentPhase ?? 'recomp',
      }),
    [synergyExerciseId, biometricLogs, workoutSessions, userProfile?.currentPhase]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      {/* Cabecera simple y amigable */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            <Dumbbell className="h-3.5 w-3.5" />
            Entrenamiento Guiado
          </span>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
            ¿Qué vamos a entrenar hoy?
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Elige tu rutina, anota tus repeticiones y marca{' '}
            <strong className="font-bold text-emerald-700">Listo [✓]</strong> al terminar cada serie.
          </p>
        </div>

        {/* Sub-pestañas claras */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              {
                id: 'active_workout',
                label: 'Entrenar Hoy',
                icon: Zap,
              },
              {
                id: 'catalog',
                label: `Ejercicios (${exerciseCatalog.length})`,
                icon: BookOpen,
              },
              {
                id: 'routines',
                label: 'Mis Rutinas',
                icon: Layers,
              },
              {
                id: 'analytics',
                label: 'Mi Progreso',
                icon: BarChart3,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notificación de guardado */}
      {sessionSavedBanner && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <Trophy className="h-5 w-5 text-amber-500" />
            <span>{sessionSavedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSessionSavedBanner(null)}
            className="rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          >
            Cerrar
          </button>
        </motion.div>
      )}

      {/* ====================================================================
          VISTA 1: ENTRENAR HOY
         ==================================================================== */}
      {subTab === 'active_workout' && activeRoutine && (
        <div className="space-y-6">
          {/* Selector de rutina y botón de guardar */}
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-bold text-slate-700">
                Rutina de hoy:
              </label>
              <select
                value={selectedRoutineId}
                onChange={(e) => setSelectedRoutineId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
              >
                {workoutRoutines.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <div className="text-left sm:text-right">
                <span className="block text-xs font-semibold text-slate-500">
                  Avance de hoy
                </span>
                <span className="text-base font-extrabold text-slate-900">
                  {completedSetsCount} de {allCurrentSessionSets.length} series listas
                </span>
                {liveSessionTonnageKg > 0 && (
                  <span className="ml-2 text-xs font-semibold text-emerald-600">
                    ({liveSessionTonnageKg.toLocaleString()} kg)
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={completedSetsCount === 0}
                onClick={handleFinishAndSaveWorkout}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
                <span>Guardar Entrenamiento</span>
              </button>
            </div>
          </div>

          {/* Lista de ejercicios de la rutina */}
          <div className="space-y-5">
            {activeRoutine.exercises.map((rEx, exIdx) => {
              const exItem = catalogMap.get(rEx.exerciseId);
              if (!exItem) return null;

              const progPlan = getDoubleProgressionSuggestion({
                routineExercise: rEx,
                catalogItem: exItem,
                previousSessions: workoutSessions,
              });

              const sets = activeSetsByExercise[rEx.exerciseId] ?? [];

              return (
                <div
                  key={rEx.exerciseId}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  {/* Encabezado del ejercicio */}
                  <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-4">
                      <img
                        src={exItem.images[0]}
                        alt={exItem.nameEs}
                        onClick={() => {
                          setDetailModalExercise(exItem);
                          setDetailModalTab('demo');
                        }}
                        className="h-16 w-16 cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 object-contain p-1 transition hover:scale-105"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                            {exIdx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setDetailModalExercise(exItem);
                              setDetailModalTab('demo');
                            }}
                            className="text-left text-lg font-extrabold text-slate-900 hover:text-indigo-600"
                          >
                            {exItem.nameEs}
                          </button>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {exItem.primaryMuscle} · {exItem.equipment} · Meta:{' '}
                          <strong className="font-bold text-slate-800">
                            {rEx.targetSets} series de {rEx.targetRepRange[0]} a{' '}
                            {rEx.targetRepRange[1]} repeticiones
                          </strong>
                        </p>
                      </div>
                    </div>

                    {/* Sugerencia simple */}
                    <div
                      className={`rounded-2xl border px-4 py-2.5 text-xs ${
                        progPlan.allWorkingSetsHitTopOfRange
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-indigo-100 bg-indigo-50/70 text-indigo-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
                        <span>Sugerencia para hoy</span>
                      </div>
                      <p className="mt-0.5 text-slate-700">
                        {progPlan.summaryBanner}
                      </p>
                    </div>
                  </div>

                  {/* Tabla limpia de series */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 pr-3">Serie</th>
                          <th className="px-3 py-2.5">Vez anterior / Sugerido</th>
                          <th className="px-3 py-2.5">Peso (kg)</th>
                          <th className="px-3 py-2.5">Repeticiones</th>
                          <th className="py-2.5 pl-3 text-right">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sets.map((s, idx) => {
                          const ghost =
                            progPlan.setSuggestions[idx] ??
                            progPlan.setSuggestions[progPlan.setSuggestions.length - 1];

                          const isWarmup = s.setType === 'warmup';

                          return (
                            <tr
                              key={s.id}
                              className={`transition ${
                                s.isCompleted ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                              }`}
                            >
                              {/* Número de serie */}
                              <td className="py-3 pr-3">
                                <button
                                  type="button"
                                  title="Clic para cambiar entre Serie normal y Calentamiento"
                                  onClick={() =>
                                    handleCycleSetType(rEx.exerciseId, s.id)
                                  }
                                  className={`inline-flex items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                                    isWarmup
                                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                                      : 'border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200'
                                  }`}
                                >
                                  {isWarmup ? 'Calentamiento' : `Serie ${s.setNumber}`}
                                </button>
                              </td>

                              {/* Anterior y sugerido */}
                              <td className="px-3 py-3 text-xs text-slate-600">
                                <div className="font-semibold text-slate-800">
                                  Anterior: {ghost?.previousText ?? 'Primera vez'}
                                </div>
                                {ghost && (
                                  <div className="mt-0.5 font-medium text-indigo-600">
                                    Hoy: {ghost.suggestedWeightKg} kg × {ghost.suggestedReps} reps
                                  </div>
                                )}
                              </td>

                              {/* Input Peso */}
                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  step={0.5}
                                  value={s.weightKg}
                                  onChange={(e) =>
                                    handleUpdateSetField(
                                      rEx.exerciseId,
                                      s.id,
                                      'weightKg',
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                                />
                              </td>

                              {/* Input Repeticiones */}
                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  step={1}
                                  value={s.reps}
                                  onChange={(e) =>
                                    handleUpdateSetField(
                                      rEx.exerciseId,
                                      s.id,
                                      'reps',
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                                />
                              </td>

                              {/* Botón Listo */}
                              <td className="py-3 pl-3 text-right">
                                <div className="inline-flex items-center gap-2">
                                  {(s.isPr1RM || s.isPrWeight) && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                                      🏆 Récord
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleCompleteSet(
                                        rEx.exerciseId,
                                        s.id,
                                        rEx.restSeconds,
                                        exItem.nameEs
                                      )
                                    }
                                    className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                      s.isCompleted
                                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                                        : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-700'
                                    }`}
                                  >
                                    <Check className="h-4 w-4" />
                                    <span>{s.isCompleted ? 'Listo' : 'Marcar'}</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pie de tarjeta: agregar serie o ver instrucciones */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => handleAddSetToExercise(rEx.exerciseId)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Agregar otra serie</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDetailModalExercise(exItem);
                        setDetailModalTab('demo');
                      }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-500"
                    >
                      Ver cómo se hace paso a paso →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Agregar otro ejercicio rápido sin salir */}
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-dashed border-slate-300 bg-white p-5 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-bold text-slate-900">
                ¿Quieres agregar otro ejercicio hoy?
              </div>
              <p className="text-xs text-slate-500">
                Elígelo de la lista y se sumará a tu entrenamiento de inmediato
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={quickAddExerciseId}
                onChange={(e) => setQuickAddExerciseId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900"
              >
                {exerciseCatalog.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.nameEs} ({ex.primaryMuscle})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  addExerciseToRoutine(activeRoutine.id, quickAddExerciseId);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar Ejercicio</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          VISTA 2: CATÁLOGO DE EJERCICIOS
         ==================================================================== */}
      {subTab === 'catalog' && (
        <div className="space-y-6">
          {/* Buscador y filtros */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="relative md:col-span-8">
                <Search className="pointer-events-none absolute top-3.5 left-4 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar ejercicio: Press Banca, Sentadilla, Remo, Glúteos..."
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 py-3 pr-4 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="md:col-span-4">
                <select
                  value={selectedEquipmentFilter}
                  onChange={(e) =>
                    setSelectedEquipmentFilter(
                      e.target.value as EquipmentEs | 'ALL'
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
                >
                  <option value="ALL">Cualquier equipo</option>
                  {EQUIPMENT_CHIPS.filter((c) => c !== 'ALL').map((eq) => (
                    <option key={eq} value={eq}>
                      {eq}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Botones por músculo */}
            <div className="mt-4 flex flex-wrap gap-2">
              {QUICK_MUSCLE_CHIPS.map((chip) => {
                const active = selectedMuscleFilter === chip.value;
                return (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setSelectedMuscleFilter(chip.value)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                      active
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tarjetas de ejercicios */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCatalog.map((ex) => {
              const isPlayingGif = Boolean(animatedPreviewIds[ex.id]);

              return (
                <div
                  key={ex.id}
                  className="flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                >
                  <div>
                    <div className="relative h-48 w-full bg-slate-50 p-3">
                      <img
                        src={isPlayingGif ? ex.images[1] : ex.images[0]}
                        alt={ex.nameEs}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAnimatedPreviewIds((prev) => ({
                            ...prev,
                            [ex.id]: !prev[ex.id],
                          }))
                        }
                        className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        {isPlayingGif ? (
                          <>
                            <Pause className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Pausar</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 text-indigo-600" />
                            <span>Ver movimiento</span>
                          </>
                        )}
                      </button>
                      <span className="absolute top-3 left-3 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                        {ex.primaryMuscle}
                      </span>
                    </div>

                    <div className="p-5">
                      <h3 className="text-base font-extrabold text-slate-900">
                        {ex.nameEs}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Equipo: {ex.equipment}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
                    {activeRoutine && (
                      <button
                        type="button"
                        onClick={() => {
                          addExerciseToRoutine(activeRoutine.id, ex.id);
                          setSessionSavedBanner(
                            `"${ex.nameEs}" se agregó a tu rutina "${activeRoutine.name}".`
                          );
                        }}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:border-emerald-500 hover:text-emerald-700"
                      >
                        + Usar en mi rutina
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDetailModalExercise(ex);
                        setDetailModalTab('demo');
                      }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-500"
                    >
                      Cómo se hace →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====================================================================
          VISTA 3: MIS RUTINAS
         ==================================================================== */}
      {subTab === 'routines' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Lista lateral de rutinas */}
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-900">
                  Tus Rutinas
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    const fresh: WorkoutRoutine = {
                      id: `routine-custom-${Date.now()}`,
                      name: 'Mi Nueva Rutina',
                      assignedDays: [1, 4],
                      exercises: [
                        {
                          exerciseId: 'og-0025',
                          order: 1,
                          targetSets: 3,
                          targetRepRange: [8, 12],
                          targetRir: 1,
                          restSeconds: 120,
                          progressionRule: 'double_progression',
                        },
                      ],
                    };
                    setEditingRoutine(fresh);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Nueva</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {workoutRoutines.map((r) => {
                  const isSelected = editingRoutine.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setEditingRoutine(r)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-sm font-extrabold text-slate-900">
                        {r.name}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>{r.exercises.length} ejercicios</span>
                        <span>
                          {r.assignedDays.map((d) => DAYS_SHORT[d]).join(', ')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Editor de la rutina seleccionada */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-8">
            <div className="mb-5 flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Nombre de la rutina
                </label>
                <input
                  type="text"
                  value={editingRoutine.name}
                  onChange={(e) =>
                    setEditingRoutine({ ...editingRoutine, name: e.target.value })
                  }
                  className="mt-1.5 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-base font-extrabold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  saveWorkoutRoutine(editingRoutine);
                  setSelectedRoutineId(editingRoutine.id);
                  setRoutineSavedToast(`Rutina "${editingRoutine.name}" guardada.`);
                  setTimeout(() => setRoutineSavedToast(null), 3500);
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
              >
                <Check className="h-4 w-4" />
                <span>Guardar Cambios</span>
              </button>
            </div>

            {routineSavedToast && (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
                {routineSavedToast}
              </div>
            )}

            {/* Días de la semana */}
            <div className="mb-6">
              <span className="mb-2 block text-xs font-bold text-slate-600">
                ¿Qué días haces esta rutina?
              </span>
              <div className="flex flex-wrap gap-2">
                {DAYS_SHORT.map((dayName, dayIdx) => {
                  const active = editingRoutine.assignedDays.includes(dayIdx);
                  return (
                    <button
                      key={dayName}
                      type="button"
                      onClick={() => {
                        const exists = editingRoutine.assignedDays.includes(dayIdx);
                        const nextDays = exists
                          ? editingRoutine.assignedDays.filter((d) => d !== dayIdx)
                          : [...editingRoutine.assignedDays, dayIdx].sort();
                        setEditingRoutine({
                          ...editingRoutine,
                          assignedDays: nextDays,
                        });
                      }}
                      className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                        active
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {dayName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ejercicios dentro de la rutina */}
            <div className="space-y-3">
              {editingRoutine.exercises.map((rEx, idx) => {
                const exInfo = catalogMap.get(rEx.exerciseId);

                return (
                  <div
                    key={`${rEx.exerciseId}-${idx}`}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">
                        {idx + 1}. {exInfo?.nameEs ?? rEx.exerciseId}
                      </div>
                      <div className="text-xs text-slate-500">
                        {exInfo?.primaryMuscle} · {exInfo?.equipment}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div>
                        <span className="block text-[11px] font-semibold text-slate-500">
                          Series
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={rEx.targetSets}
                          onChange={(e) => {
                            const next = editingRoutine.exercises.map((item, i) =>
                              i === idx
                                ? { ...item, targetSets: Number(e.target.value) }
                                : item
                            );
                            setEditingRoutine({ ...editingRoutine, exercises: next });
                          }}
                          className="mt-0.5 w-16 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <span className="block text-[11px] font-semibold text-slate-500">
                          Repeticiones
                        </span>
                        <div className="mt-0.5 flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={rEx.targetRepRange[0]}
                            onChange={(e) => {
                              const next = editingRoutine.exercises.map((item, i) =>
                                i === idx
                                  ? {
                                      ...item,
                                      targetRepRange: [
                                        Number(e.target.value),
                                        item.targetRepRange[1],
                                      ] as [number, number],
                                    }
                                  : item
                              );
                              setEditingRoutine({ ...editingRoutine, exercises: next });
                            }}
                            className="w-14 rounded-xl border border-slate-300 bg-white px-2 py-1.5 font-bold text-slate-900"
                          />
                          <span className="text-slate-400">a</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={rEx.targetRepRange[1]}
                            onChange={(e) => {
                              const next = editingRoutine.exercises.map((item, i) =>
                                i === idx
                                  ? {
                                      ...item,
                                      targetRepRange: [
                                        item.targetRepRange[0],
                                        Number(e.target.value),
                                      ] as [number, number],
                                    }
                                  : item
                              );
                              setEditingRoutine({ ...editingRoutine, exercises: next });
                            }}
                            className="w-14 rounded-xl border border-slate-300 bg-white px-2 py-1.5 font-bold text-slate-900"
                          />
                        </div>
                      </div>

                      <div>
                        <span className="block text-[11px] font-semibold text-slate-500">
                          Descanso (seg)
                        </span>
                        <input
                          type="number"
                          step={15}
                          value={rEx.restSeconds}
                          onChange={(e) => {
                            const next = editingRoutine.exercises.map((item, i) =>
                              i === idx
                                ? { ...item, restSeconds: Number(e.target.value) }
                                : item
                            );
                            setEditingRoutine({ ...editingRoutine, exercises: next });
                          }}
                          className="mt-0.5 w-20 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-900"
                        />
                      </div>

                      <div className="flex items-center gap-1 pt-4">
                        <button
                          type="button"
                          onClick={() => handleMoveRoutineExercise(idx, idx - 1)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                          title="Subir"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveRoutineExercise(idx, idx + 1)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                          title="Bajar"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = editingRoutine.exercises
                              .filter((_, i) => i !== idx)
                              .map((item, i) => ({ ...item, order: i + 1 }));
                            setEditingRoutine({ ...editingRoutine, exercises: next });
                          }}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                          title="Quitar ejercicio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Agregar ejercicio a la rutina */}
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
              <select
                value={exerciseToAddId}
                onChange={(e) => setExerciseToAddId(e.target.value)}
                className="flex-1 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900"
              >
                {exerciseCatalog.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.nameEs} ({ex.primaryMuscle})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const nextEx: WorkoutRoutineExercise = {
                    exerciseId: exerciseToAddId,
                    order: editingRoutine.exercises.length + 1,
                    targetSets: 3,
                    targetRepRange: [8, 12],
                    targetRir: 1,
                    restSeconds: 120,
                    progressionRule: 'double_progression',
                  };
                  setEditingRoutine({
                    ...editingRoutine,
                    exercises: [...editingRoutine.exercises, nextEx],
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar a la rutina</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          VISTA 4: MI PROGRESO MUSCULAR
         ==================================================================== */}
      {subTab === 'analytics' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Músculos trabajados en la semana */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6">
            <h2 className="text-lg font-extrabold text-slate-900">
              Músculos trabajados esta semana
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Lo ideal para progresar es hacer entre 10 y 20 series por grupo muscular cada semana.
            </p>

            <div className="mt-5 space-y-3.5">
              {weeklyMuscleVolume.slice(0, 10).map((item) => {
                const widthPct = Math.min(100, (item.totalEffectiveSets / 20) * 100);
                let barColor = 'bg-slate-400';
                let friendlyStatus = 'Falta entrenar';
                if (item.zone === 'mev') {
                  barColor = 'bg-blue-500';
                  friendlyStatus = 'En buen camino';
                } else if (item.zone === 'mav') {
                  barColor = 'bg-emerald-500';
                  friendlyStatus = 'Meta óptima';
                } else if (item.zone === 'mrv_risk') {
                  barColor = 'bg-amber-500';
                  friendlyStatus = 'Mucho volumen';
                }

                return (
                  <div key={item.muscle} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{item.muscle}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900">
                          {item.totalEffectiveSets} series
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          {friendlyStatus}
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fuerza vs. Peso Corporal */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Evolución de tu Fuerza
                </h2>
                <p className="text-xs text-slate-500">
                  Compara tu fuerza máxima con tu peso corporal
                </p>
              </div>

              <select
                value={synergyExerciseId}
                onChange={(e) => setSynergyExerciseId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900"
              >
                <option value="og-0043">Sentadilla con Barra</option>
                <option value="og-0025">Press de Banca Plano</option>
                <option value="og-0085">Peso Muerto Rumano</option>
                <option value="og-1409">Hip Thrust con Barra</option>
                <option value="og-0027">Remo con Barra</option>
              </select>
            </div>

            <div
              className={`mb-4 rounded-2xl border p-4 text-xs ${
                synergyReport.isSuccessfulRecompOrRetention
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                <Award className="h-4 w-4 text-emerald-600" />
                <span>{synergyReport.synergyBadgeTitle}</span>
              </div>
              <p className="mt-1 leading-relaxed text-slate-700">
                {synergyReport.synergyExplanation}
              </p>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={synergyReport.points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => v.slice(5)}
                    stroke="#64748b"
                    fontSize={11}
                  />
                  <YAxis
                    yAxisId="left"
                    domain={['dataMin - 1', 'dataMax + 1']}
                    stroke="#059669"
                    fontSize={11}
                    tickFormatter={(v: number) => `${v}kg`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={['dataMin - 5', 'dataMax + 5']}
                    stroke="#4f46e5"
                    fontSize={11}
                    tickFormatter={(v: number) => `${v}kg`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#0f172a',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="trendWeightKg"
                    name="Tu Peso Promedio (kg)"
                    stroke="#059669"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="estimated1RM"
                    name="Fuerza Estimada (kg)"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: CÓMO SE HACE EL EJERCICIO
         ==================================================================== */}
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
                  {workoutSessions
                    .filter((s) =>
                      s.sets.some((st) => st.exerciseId === detailModalExercise.id)
                    )
                    .map((sess) => {
                      const exSets = sess.sets.filter(
                        (st) => st.exerciseId === detailModalExercise.id
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
                    })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  <div className="text-sm font-extrabold text-slate-900">
                    Tiempo de descanso
                  </div>
                  <div className="text-xs font-medium text-slate-500">
                    {restTimerExerciseName} · Meta {restTimerTotal} seg
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRestTimerRemaining((prev) => Math.max(0, prev - 15))
                  }
                  className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  -15s
                </button>
                <button
                  type="button"
                  onClick={() => setRestTimerRemaining((prev) => prev + 15)}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  +15s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRestTimerActive(false);
                    setRestTimerRemaining(0);
                  }}
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
    </div>
  );
};

const INITIAL_ROUTINE_FALLBACK: WorkoutRoutine = {
  id: 'routine-fallback',
  name: 'Rutina Base',
  assignedDays: [1, 4],
  exercises: [],
};
