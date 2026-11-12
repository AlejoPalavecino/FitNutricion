import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChefHat,
  Dumbbell,
  Scale,
  Search,
  Sparkles,
  Target,
  Utensils,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { generateUuid } from '../../lib/ids';
import {
  calculateFoodItemMacros,
  calculateRemainingMacros,
  suggestBridgeFoods,
} from '../../lib/metabolism';
import { useNutritionStore } from '../../store/useNutritionStore';
import type { NutritionalPhase } from '../../types/nutrition';
import { useDialogFocus } from '../useDialogFocus';

export type MainAppTab = 'onboarding' | 'nutrition' | 'gym' | 'biometrics';

interface QuickActionCommandProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: MainAppTab) => void;
}

const MEAL_SLOTS = [
  { label: 'Desayuno', hour: 8 },
  { label: 'Almuerzo', hour: 13 },
  { label: 'Merienda', hour: 17 },
  { label: 'Cena', hour: 21 },
];

export const QuickActionCommand: React.FC<QuickActionCommandProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const userProfile = useNutritionStore((s) => s.userProfile);
  const foods = useNutritionStore((s) => s.foods);
  const recipes = useNutritionStore((s) => s.recipes);
  const timelineLogs = useNutritionStore((s) => s.timelineLogs);
  const biometricLogs = useNutritionStore((s) => s.biometricLogs);
  const exerciseCatalog = useNutritionStore((s) => s.exerciseCatalog);
  const workoutRoutines = useNutritionStore((s) => s.workoutRoutines);
  const selectedDate = useNutritionStore((s) => s.selectedDate);

  const addTimelineLog = useNutritionStore((s) => s.addTimelineLog);
  const addOrUpdateBiometricLog = useNutritionStore((s) => s.addOrUpdateBiometricLog);
  const updatePhaseAndMacros = useNutritionStore((s) => s.updatePhaseAndMacros);
  const addExerciseToRoutine = useNutritionStore((s) => s.addExerciseToRoutine);
  const saveWorkoutRoutine = useNutritionStore((s) => s.saveWorkoutRoutine);

  const [query, setQuery] = useState('');
  const [selectedMealHour, setSelectedMealHour] = useState<number>(13);
  const [quickToast, setQuickToast] = useState<string | null>(null);

  const latestBio = biometricLogs[biometricLogs.length - 1];
  const [quickWeight, setQuickWeight] = useState<number>(latestBio?.scaleWeightKg ?? 70);

  useEffect(() => {
    if (latestBio?.scaleWeightKg) {
      setQuickWeight(latestBio.scaleWeightKg);
    }
  }, [latestBio?.scaleWeightKg]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setQuickToast(null);
    }
  }, [isOpen]);

  const dayLogs = useMemo(
    () => timelineLogs.filter((l) => l.date === selectedDate),
    [timelineLogs, selectedDate],
  );

  const consumedMacros = useMemo(
    () =>
      dayLogs.reduce(
        (acc, item) => ({
          kcal: acc.kcal + item.calculatedMacros.kcal,
          proteinG: Number((acc.proteinG + item.calculatedMacros.proteinG).toFixed(1)),
          carbsG: Number((acc.carbsG + item.calculatedMacros.carbsG).toFixed(1)),
          fatG: Number((acc.fatG + item.calculatedMacros.fatG).toFixed(1)),
          fiberG: Number((acc.fiberG + item.calculatedMacros.fiberG).toFixed(1)),
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
      ),
    [dayLogs],
  );

  const targetMacros = useMemo(
    () => ({
      kcal: userProfile?.targetKcal ?? 2400,
      proteinG: userProfile?.targetProteinG ?? 175,
      carbsG: userProfile?.targetCarbsG ?? 250,
      fatG: userProfile?.targetFatG ?? 65,
      fiberG: userProfile?.targetFiberG ?? 34,
    }),
    [userProfile],
  );

  const remainingVector = useMemo(
    () => calculateRemainingMacros(targetMacros, consumedMacros),
    [targetMacros, consumedMacros],
  );

  const topBridgeSuggestion = useMemo(
    () => suggestBridgeFoods(remainingVector, foods)[0] ?? null,
    [remainingVector, foods],
  );

  const matchingFoods = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods.filter((f) => f.isFavorite).slice(0, 4);
    return foods
      .filter(
        (f) => f.name.toLowerCase().includes(q) || (f.brand && f.brand.toLowerCase().includes(q)),
      )
      .slice(0, 5);
  }, [foods, query]);

  const matchingExercises = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exerciseCatalog.slice(0, 4);
    return exerciseCatalog
      .filter(
        (ex) =>
          ex.nameEs.toLowerCase().includes(q) ||
          ex.nameEn.toLowerCase().includes(q) ||
          ex.primaryMuscle.toLowerCase().includes(q) ||
          ex.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 5);
  }, [exerciseCatalog, query]);

  const matchingRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes.slice(0, 2);
    return recipes
      .filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
      .slice(0, 3);
  }, [recipes, query]);

  const showFeedback = (msg: string) => {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(null), 2400);
  };

  const dialogRef = useDialogFocus(isOpen, onClose);
  if (!isOpen) return null;

  const primaryRoutine = workoutRoutines[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-3 pt-10 backdrop-blur-xs sm:p-6 sm:pt-14"
        onClick={onClose}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Añadir rápido"
          initial={{ scale: 0.97, opacity: 0, y: -8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.97, opacity: 0, y: -8 }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
        >
          {/* Buscador */}
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-3 left-3.5 h-5 w-5 text-emerald-600" />
              <input
                aria-label="Buscar alimentos o ejercicios"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Escribe una comida o ejercicio (ej. pollo, avena, press banca)..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pr-4 pl-11 text-base text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {quickToast && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>{quickToast}</span>
            </div>
          )}

          {/* 2 Acciones Rápidas de Hoy */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Scale className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Tu peso hoy</div>
                  <div className="text-xs text-slate-500">Guardar en 1 clic</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step={0.1}
                  value={quickWeight}
                  onChange={(e) => setQuickWeight(Number(e.target.value))}
                  className="w-18 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-bold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    addOrUpdateBiometricLog({ scaleWeightKg: quickWeight });
                    showFeedback(`Peso guardado: ${quickWeight} kg`);
                  }}
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Guardar
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900">
                    {topBridgeSuggestion ? topBridgeSuggestion.title : 'Meta del día lista'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {remainingVector.kcal > 0
                      ? `Completa tus ${remainingVector.kcal} kcal restantes`
                      : 'Comidas completas hoy'}
                  </div>
                </div>
              </div>
              {topBridgeSuggestion && (
                <button
                  type="button"
                  onClick={() => {
                    for (const item of topBridgeSuggestion.items) {
                      addTimelineLog({
                        date: selectedDate,
                        hour: selectedMealHour,
                        foodId: item.food.id,
                        customLabel: item.food.name,
                        gramsConsumed: item.grams,
                        overrideMacros: item.macros,
                      });
                    }
                    showFeedback(`Añadido: ${topBridgeSuggestion.title}`);
                  }}
                  className="shrink-0 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
                >
                  + Sumar
                </button>
              )}
            </div>
          </div>

          {/* 1. Comidas Rápidas */}
          <div className="mt-5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <Utensils className="h-4 w-4 text-emerald-600" />
                <span>Comidas frecuentes (toca para sumar hoy)</span>
              </span>
              <div className="flex items-center gap-1">
                {MEAL_SLOTS.map((slot) => (
                  <button
                    key={slot.hour}
                    type="button"
                    onClick={() => setSelectedMealHour(slot.hour)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      selectedMealHour === slot.hour
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {matchingFoods.map((food) => {
                const macros = calculateFoodItemMacros(food, food.defaultServingGrams);
                return (
                  <div
                    key={food.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-2xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900">{food.name}</div>
                      <div className="text-xs text-slate-500">
                        {food.defaultServingGrams}g · {macros.kcal} kcal · {macros.proteinG}g
                        proteína
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        addTimelineLog({
                          date: selectedDate,
                          hour: selectedMealHour,
                          foodId: food.id,
                          customLabel: food.name,
                          gramsConsumed: food.defaultServingGrams,
                          overrideMacros: macros,
                        });
                        showFeedback(`${food.name} añadido.`);
                      }}
                      className="shrink-0 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                    >
                      + Añadir
                    </button>
                  </div>
                );
              })}

              {matchingRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate font-bold text-slate-900">
                      <ChefHat className="h-4 w-4 shrink-0 text-indigo-600" />
                      <span className="truncate">{recipe.name}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {recipe.totalMacros.kcal} kcal · {recipe.totalMacros.proteinG}g proteína
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      addTimelineLog({
                        date: selectedDate,
                        hour: selectedMealHour,
                        recipeId: recipe.id,
                        customLabel: recipe.name,
                        gramsConsumed: recipe.totalMacros.totalGrams,
                        overrideMacros: recipe.totalMacros,
                      });
                      showFeedback(`Receta "${recipe.name}" añadida.`);
                    }}
                    className="shrink-0 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
                  >
                    + Receta
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Ejercicios */}
          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <Dumbbell className="h-4 w-4 text-indigo-600" />
                <span>Ejercicios de gimnasio</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab('gym');
                  onClose();
                }}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                Ver todos →
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {matchingExercises.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 text-sm shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={ex.images[0]}
                      alt={ex.nameEs}
                      className="h-10 w-10 shrink-0 rounded-xl border border-slate-100 bg-slate-50 object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900">{ex.nameEs}</div>
                      <div className="text-xs text-slate-500">{ex.primaryMuscle}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (primaryRoutine) {
                          addExerciseToRoutine(primaryRoutine.id, ex.id);
                          showFeedback(`"${ex.nameEs}" añadido a tu rutina.`);
                        } else {
                          saveWorkoutRoutine({
                            id: `routine-${generateUuid()}`,
                            name: 'Mi Rutina 1',
                            assignedDays: [new Date().getDay()],
                            exercises: [
                              {
                                exerciseId: ex.id,
                                order: 1,
                                targetSets: 3,
                                targetRepRange: [8, 12],
                                targetRir: 2,
                                restSeconds: 120,
                                progressionRule: 'double_progression',
                              },
                            ],
                          });
                          showFeedback(`Rutina "Mi Rutina 1" creada con "${ex.nameEs}".`);
                        }
                      }}
                      className="rounded-xl bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
                    >
                      + Rutina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Cambiar Objetivo */}
          {userProfile && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <Target className="h-4 w-4 text-emerald-600" />
                <span>Cambiar tu objetivo en 1 clic</span>
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    { id: 'cut', label: 'Bajar Grasa' },
                    { id: 'recomp', label: 'Recomposición' },
                    { id: 'maintenance', label: 'Mantener Peso' },
                    { id: 'bulk', label: 'Ganar Músculo' },
                  ] as Array<{ id: NutritionalPhase; label: string }>
                ).map((p) => {
                  const active = userProfile.currentPhase === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        updatePhaseAndMacros(p.id);
                        showFeedback(`Objetivo cambiado a: ${p.label}`);
                      }}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
