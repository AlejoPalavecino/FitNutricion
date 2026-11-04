import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Droplets,
  Dumbbell,
  Flame,
  Lock,
  Ruler,
  Scale,
  Sparkles,
  Target,
} from 'lucide-react';
import type {
  BiologicalSex,
  NutritionalPhase,
  TrainingExperience,
} from '../../types/nutrition';
import {
  calculateAgeFromBirthDate,
  calculateHierarchicalMacros,
  calculateTargetCaloriesForPhase,
  evaluateAnthropometrics,
  recommendNutritionalPhase,
} from '../../lib/metabolism';
import { useNutritionStore } from '../../store/useNutritionStore';

interface OnboardingDiagnosticProps {
  onCompleted?: () => void;
  isReconfiguring?: boolean;
}

const ACTIVITY_OPTIONS = [
  {
    value: 1.2,
    label: 'Poco activo',
    desc: 'Trabajo sentado, pocos pasos al día',
  },
  {
    value: 1.375,
    label: 'Ligero (1-2 días)',
    desc: 'Caminatas o ejercicio suave 1 a 2 veces por semana',
  },
  {
    value: 1.55,
    label: 'Moderado (3-5 días)',
    desc: 'Gimnasio o deporte 3 a 5 veces por semana',
  },
  {
    value: 1.725,
    label: 'Muy activo (5+ días)',
    desc: 'Entrenamiento intenso casi todos los días',
  },
];

const SIMPLE_PHASE_INFO: Record<
  NutritionalPhase,
  { title: string; desc: string }
> = {
  cut: {
    title: 'Bajar Grasa',
    desc: 'Reduces grasa corporal cuidando tu músculo.',
  },
  recomp: {
    title: 'Recomposición',
    desc: 'Pierdes grasa poco a poco mientras ganas fuerza.',
  },
  maintenance: {
    title: 'Mantener Peso',
    desc: 'Mantienes tu peso actual con buena energía.',
  },
  bulk: {
    title: 'Ganar Músculo',
    desc: 'Comer un poco más para subir masa muscular limpia.',
  },
};

export const OnboardingDiagnostic: React.FC<OnboardingDiagnosticProps> = ({
  onCompleted,
  isReconfiguring = false,
}) => {
  const existingProfile = useNutritionStore((s) => s.userProfile);
  const biometricLogs = useNutritionStore((s) => s.biometricLogs);
  const completeOnboarding = useNutritionStore((s) => s.completeOnboarding);

  const latestBio = biometricLogs[biometricLogs.length - 1];

  const [name, setName] = useState(existingProfile?.name ?? 'Alejandro');
  const [sex, setSex] = useState<BiologicalSex>(
    existingProfile?.sex ?? 'male'
  );
  const [birthDate, setBirthDate] = useState(
    existingProfile?.birthDate ?? '1997-06-15'
  );
  const [heightCm, setHeightCm] = useState<number>(
    existingProfile?.heightCm ?? 178
  );
  const [weightKg, setWeightKg] = useState<number>(
    latestBio?.scaleWeightKg ?? 80.5
  );
  const [pal, setPal] = useState<number>(existingProfile?.initialPal ?? 1.55);
  const [trainingExperience, setTrainingExperience] =
    useState<TrainingExperience>(
      existingProfile?.trainingExperience ?? 'intermediate'
    );

  // Cinta métrica opcional (colapsada por defecto para no abrumar)
  const [useTapeMeasurements, setUseTapeMeasurements] = useState<boolean>(
    latestBio ? latestBio.bfMethod === 'us_navy' : false
  );
  const [neckCm, setNeckCm] = useState<number>(latestBio?.neckCm ?? 39.0);
  const [waistCm, setWaistCm] = useState<number>(latestBio?.waistCm ?? 85.0);
  const [hipCm, setHipCm] = useState<number>(latestBio?.hipCm ?? 97.0);

  const [userSelectedPhase, setUserSelectedPhase] =
    useState<NutritionalPhase | null>(existingProfile?.currentPhase ?? null);
  const [seed21DaySimulation, setSeed21DaySimulation] = useState<boolean>(
    !isReconfiguring
  );

  const age = useMemo(() => calculateAgeFromBirthDate(birthDate), [birthDate]);

  const diagnostic = useMemo(() => {
    return evaluateAnthropometrics({
      sex,
      age,
      heightCm,
      weightKg,
      pal,
      trainingExperience,
      neckCm: useTapeMeasurements ? neckCm : undefined,
      waistCm: useTapeMeasurements ? waistCm : undefined,
      hipCm: useTapeMeasurements && sex === 'female' ? hipCm : undefined,
    });
  }, [
    sex,
    age,
    heightCm,
    weightKg,
    pal,
    trainingExperience,
    useTapeMeasurements,
    neckCm,
    waistCm,
    hipCm,
  ]);

  const phaseRecommendation = useMemo(() => {
    return recommendNutritionalPhase(
      {
        sex,
        age,
        heightCm,
        weightKg,
        pal,
        trainingExperience,
        neckCm: useTapeMeasurements ? neckCm : undefined,
        waistCm: useTapeMeasurements ? waistCm : undefined,
        hipCm: useTapeMeasurements && sex === 'female' ? hipCm : undefined,
      },
      diagnostic
    );
  }, [
    sex,
    age,
    heightCm,
    weightKg,
    pal,
    trainingExperience,
    useTapeMeasurements,
    neckCm,
    waistCm,
    hipCm,
    diagnostic,
  ]);

  const activePhase: NutritionalPhase = useMemo(() => {
    if (
      userSelectedPhase &&
      phaseRecommendation.options[userSelectedPhase]?.enabled
    ) {
      return userSelectedPhase;
    }
    return phaseRecommendation.recommendedPhase;
  }, [userSelectedPhase, phaseRecommendation]);

  const phaseCalorieDetails = useMemo(() => {
    return calculateTargetCaloriesForPhase({
      activeTdee: diagnostic.initialStaticTdee,
      phase: activePhase,
      fatMassKg: diagnostic.fatMassKg,
    });
  }, [diagnostic.initialStaticTdee, diagnostic.fatMassKg, activePhase]);

  const hierarchicalMacros = useMemo(() => {
    return calculateHierarchicalMacros({
      targetKcal: phaseCalorieDetails.targetKcal,
      weightKg,
      lbmKg: diagnostic.lbmKg,
      bfPercent: diagnostic.bfPercent,
      sex,
      phase: activePhase,
    });
  }, [
    phaseCalorieDetails.targetKcal,
    weightKg,
    diagnostic.lbmKg,
    diagnostic.bfPercent,
    sex,
    activePhase,
  ]);

  const handleSaveOnboarding = () => {
    completeOnboarding({
      name,
      birthDate,
      sex,
      heightCm,
      weightKg,
      initialPal: pal,
      trainingExperience,
      neckCm: useTapeMeasurements ? neckCm : undefined,
      waistCm: useTapeMeasurements ? waistCm : undefined,
      hipCm: useTapeMeasurements && sex === 'female' ? hipCm : undefined,
      selectedPhase: activePhase,
      customAdjustmentPercent: phaseCalorieDetails.appliedAdjustmentPercent,
      ewmaAlpha: 0.12,
      seed21DaySimulation,
    });
    if (onCompleted) {
      onCompleted();
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Cabecera Simple y Directa */}
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
        <div>
          <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Configuración en 3 pasos
          </span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Arma tu Plan Personalizado
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Completa tus datos básicos para calcular tus calorías y proteínas ideales.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveOnboarding}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500"
        >
          <span>
            {isReconfiguring ? 'Guardar mi Plan' : 'Empezar con este Plan'}
          </span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ===================================================================
            COLUMNA IZQUIERDA (6 cols): PASO 1 (TUS DATOS) Y PASO 2 (ACTIVIDAD)
           =================================================================== */}
        <div className="space-y-6 lg:col-span-6">
          {/* PASO 1: Sobre Ti */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  1. Tus datos básicos
                </h2>
                <p className="text-xs text-slate-500">
                  Para conocer tu punto de partida ({age} años)
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Tu nombre
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                    placeholder="Ej. Alejandro"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Fecha de nacimiento
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Sexo
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSex('male')}
                    className={`rounded-xl border py-2.5 text-sm font-bold transition ${
                      sex === 'male'
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Hombre
                  </button>
                  <button
                    type="button"
                    onClick={() => setSex('female')}
                    className={`rounded-xl border py-2.5 text-sm font-bold transition ${
                      sex === 'female'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Mujer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Altura (cm)
                  </label>
                  <input
                    type="number"
                    min={130}
                    max={230}
                    step={0.5}
                    value={heightCm}
                    onChange={(e) => setHeightCm(Number(e.target.value) || 170)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-bold text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Peso actual (kg)
                  </label>
                  <input
                    type="number"
                    min={35}
                    max={220}
                    step={0.1}
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value) || 70)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-bold text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Cinta métrica opcional */}
              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setUseTapeMeasurements((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <span className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-emerald-600" />
                    <span>
                      {useTapeMeasurements
                        ? 'Ocultar medidas con cinta métrica'
                        : '¿Tienes cinta métrica? Agregar cintura y cuello (Opcional)'}
                    </span>
                  </span>
                  <span className="text-emerald-600">
                    {useTapeMeasurements ? 'Activo' : '+ Agregar'}
                  </span>
                </button>

                {useTapeMeasurements && (
                  <div
                    className={`mt-3 grid gap-3 ${
                      sex === 'female' ? 'grid-cols-3' : 'grid-cols-2'
                    }`}
                  >
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        Cuello (cm)
                      </label>
                      <input
                        type="number"
                        step={0.5}
                        value={neckCm}
                        onChange={(e) =>
                          setNeckCm(Number(e.target.value) || 35)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        Cintura (cm)
                      </label>
                      <input
                        type="number"
                        step={0.5}
                        value={waistCm}
                        onChange={(e) =>
                          setWaistCm(Number(e.target.value) || 80)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                      />
                    </div>
                    {sex === 'female' && (
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">
                          Cadera (cm)
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          value={hipCm}
                          onChange={(e) =>
                            setHipCm(Number(e.target.value) || 95)
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PASO 2: Tu Actividad Semanal */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Dumbbell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  2. ¿Cuánto entrenas por semana?
                </h2>
                <p className="text-xs text-slate-500">
                  Elige la opción que mejor describa tu rutina actual
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {ACTIVITY_OPTIONS.map((opt) => {
                const isSelected = Math.abs(pal - opt.value) < 0.05;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPal(opt.value)}
                    className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {opt.label}
                      </div>
                      <div className="text-xs text-slate-500">{opt.desc}</div>
                    </div>
                    {isSelected && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Tiempo entrenando en gimnasio
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'novice', label: 'Principiante' },
                    { id: 'intermediate', label: 'Intermedio' },
                    { id: 'advanced', label: 'Avanzado' },
                  ] as const
                ).map((exp) => (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => setTrainingExperience(exp.id)}
                    className={`rounded-xl border py-2 text-xs font-bold transition ${
                      trainingExperience === exp.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {exp.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================================
            COLUMNA DERECHA (6 cols): PASO 3 (TU OBJETIVO Y TUS METAS DIARIAS)
           =================================================================== */}
        <div className="space-y-6 lg:col-span-6">
          {/* PASO 3: Elige tu Objetivo */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  3. ¿Cuál es tu objetivo?
                </h2>
                <p className="text-xs text-slate-500">
                  Grasa corporal estimada:{' '}
                  <strong className="text-slate-800">
                    {diagnostic.bfPercent.toFixed(1)}%
                  </strong>{' '}
                  · Masa muscular:{' '}
                  <strong className="text-slate-800">
                    {diagnostic.lbmKg.toFixed(1)} kg
                  </strong>
                </p>
              </div>
            </div>

            {/* Recomendación en lenguaje simple */}
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-emerald-50/80 p-3.5 text-xs text-emerald-900 ring-1 ring-emerald-200">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <span className="font-bold">Nuestra sugerencia para ti: </span>
                <span>
                  {SIMPLE_PHASE_INFO[phaseRecommendation.recommendedPhase].title}
                  . {SIMPLE_PHASE_INFO[phaseRecommendation.recommendedPhase].desc}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['cut', 'recomp', 'maintenance', 'bulk'] as const).map(
                (phaseKey) => {
                  const opt = phaseRecommendation.options[phaseKey];
                  const info = SIMPLE_PHASE_INFO[phaseKey];
                  const isSelected = activePhase === phaseKey;

                  return (
                    <button
                      key={phaseKey}
                      type="button"
                      disabled={!opt.enabled}
                      onClick={() => setUserSelectedPhase(phaseKey)}
                      className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                        !opt.enabled
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-50'
                          : isSelected
                            ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-600/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-extrabold text-slate-900">
                            {info.title}
                          </span>
                          {opt.recommended ? (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                              Ideal
                            </span>
                          ) : !opt.enabled ? (
                            <Lock className="h-3.5 w-3.5 text-slate-400" />
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {info.desc}
                        </p>
                      </div>

                      <div className="mt-3 border-t border-slate-100 pt-2.5">
                        <span className="text-lg font-extrabold text-slate-900">
                          {opt.targetKcal} kcal
                        </span>
                        <span className="ml-1 text-xs text-slate-500">
                          / día
                        </span>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Resumen Final de tu Plan Diario */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Flame className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">
                  Tu Meta Diaria Lista
                </h2>
              </div>
              <span className="text-xl font-extrabold text-emerald-700">
                {hierarchicalMacros.kcal} kcal / día
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-blue-50 p-4 text-center">
                <span className="text-xs font-bold text-blue-700">
                  Proteínas
                </span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {hierarchicalMacros.proteinG}g
                </div>
                <span className="text-[11px] text-slate-500">Músculo</span>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4 text-center">
                <span className="text-xs font-bold text-emerald-700">
                  Carbohidratos
                </span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {hierarchicalMacros.carbsG}g
                </div>
                <span className="text-[11px] text-slate-500">Energía</span>
              </div>

              <div className="rounded-2xl bg-amber-50 p-4 text-center">
                <span className="text-xs font-bold text-amber-800">Grasas</span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {hierarchicalMacros.fatG}g
                </div>
                <span className="text-[11px] text-slate-500">Salud</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span className="flex items-center gap-2 font-semibold">
                <Droplets className="h-4 w-4 text-blue-600" />
                <span>Agua recomendada por día:</span>
              </span>
              <strong className="text-slate-900">
                {(hierarchicalMacros.waterMl / 1000).toFixed(1)} Litros
              </strong>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4">
              <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={seed21DaySimulation}
                  onChange={(e) => setSeed21DaySimulation(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>
                  Cargar 21 días de ejemplo para ver gráficas de progreso desde hoy
                </span>
              </label>

              <button
                type="button"
                onClick={handleSaveOnboarding}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-emerald-500"
              >
                <span>
                  {isReconfiguring
                    ? 'Guardar mi Plan'
                    : 'Guardar mi Plan y Empezar'}
                </span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
