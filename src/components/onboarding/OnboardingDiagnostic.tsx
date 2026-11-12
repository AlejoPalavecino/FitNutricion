import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
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
import { useAuthStore } from '../../store/useAuthStore';

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
  const currentUser = useAuthStore((s) => s.currentUser);
  const existingProfile = useNutritionStore((s) => s.userProfile);
  const biometricLogs = useNutritionStore((s) => s.biometricLogs);
  const onboardingDraft = useNutritionStore((s) => s.onboardingDraft);
  const setOnboardingDraft = useNutritionStore((s) => s.setOnboardingDraft);
  const completeOnboarding = useNutritionStore((s) => s.completeOnboarding);

  const latestBio = biometricLogs[biometricLogs.length - 1];

  const [name, setName] = useState(
    onboardingDraft?.name ||
      existingProfile?.name ||
      currentUser?.fullName ||
      ''
  );
  const [sex, setSex] = useState<BiologicalSex>(
    onboardingDraft?.sex ?? existingProfile?.sex ?? 'male'
  );
  const [birthDate, setBirthDate] = useState(
    onboardingDraft?.birthDate || existingProfile?.birthDate || ''
  );
  const [heightInput, setHeightInput] = useState<string>(
    onboardingDraft?.heightCm
      ? String(onboardingDraft.heightCm)
      : existingProfile?.heightCm
        ? String(existingProfile.heightCm)
        : ''
  );
  const [weightInput, setWeightInput] = useState<string>(
    onboardingDraft?.weightKg
      ? String(onboardingDraft.weightKg)
      : latestBio?.scaleWeightKg
        ? String(latestBio.scaleWeightKg)
        : ''
  );
  const [pal, setPal] = useState<number>(
    onboardingDraft?.pal ?? existingProfile?.initialPal ?? 1.55
  );
  const [trainingExperience, setTrainingExperience] =
    useState<TrainingExperience>(
      onboardingDraft?.experience ??
        existingProfile?.trainingExperience ??
        'novice'
    );

  // Cinta métrica opcional (colapsada por defecto)
  const [useTapeMeasurements, setUseTapeMeasurements] = useState<boolean>(
    Boolean(onboardingDraft?.neckCm || onboardingDraft?.waistCm) ||
      (latestBio ? latestBio.bfMethod === 'us_navy' : false)
  );
  const [neckInput, setNeckInput] = useState<string>(
    onboardingDraft?.neckCm
      ? String(onboardingDraft.neckCm)
      : latestBio?.neckCm
        ? String(latestBio.neckCm)
        : ''
  );
  const [waistInput, setWaistInput] = useState<string>(
    onboardingDraft?.waistCm
      ? String(onboardingDraft.waistCm)
      : latestBio?.waistCm
        ? String(latestBio.waistCm)
        : ''
  );
  const [hipInput, setHipInput] = useState<string>(
    onboardingDraft?.hipCm
      ? String(onboardingDraft.hipCm)
      : latestBio?.hipCm
        ? String(latestBio.hipCm)
        : ''
  );

  const [userSelectedPhase, setUserSelectedPhase] =
    useState<NutritionalPhase | null>(
      onboardingDraft?.selectedPhase ?? existingProfile?.currentPhase ?? null
    );
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sincronizar automáticamente el nombre registrado de la cuenta o del perfil guardado
  useEffect(() => {
    if (existingProfile?.name) {
      setName((prev) => (prev.trim() ? prev : existingProfile.name!));
    } else if (currentUser?.fullName) {
      setName((prev) => (prev.trim() ? prev : currentUser.fullName));
    }
  }, [existingProfile?.name, currentUser?.fullName]);

  // Persistir automáticamente el borrador de onboarding ante cualquier cambio
  useEffect(() => {
    setOnboardingDraft({
      step: 1,
      name,
      sex,
      birthDate,
      heightCm: heightInput ? Number(heightInput) : '',
      weightKg: weightInput ? Number(weightInput) : '',
      pal,
      experience: trainingExperience,
      neckCm: neckInput ? Number(neckInput) : '',
      waistCm: waistInput ? Number(waistInput) : '',
      hipCm: hipInput ? Number(hipInput) : '',
      selectedPhase: userSelectedPhase,
    });
  }, [
    name,
    sex,
    birthDate,
    heightInput,
    weightInput,
    pal,
    trainingExperience,
    neckInput,
    waistInput,
    hipInput,
    userSelectedPhase,
    setOnboardingDraft,
  ]);

  const heightCm = Number(heightInput);
  const weightKg = Number(weightInput);
  const neckCm = neckInput ? Number(neckInput) : undefined;
  const waistCm = waistInput ? Number(waistInput) : undefined;
  const hipCm = hipInput ? Number(hipInput) : undefined;

  const isBasicDataComplete =
    Boolean(birthDate) &&
    Number.isFinite(heightCm) &&
    heightCm >= 120 &&
    heightCm <= 240 &&
    Number.isFinite(weightKg) &&
    weightKg >= 30 &&
    weightKg <= 250;

  const age = useMemo(
    () => { try { return birthDate ? calculateAgeFromBirthDate(birthDate) : null; } catch { return null; } },
    [birthDate]
  );

  const diagnostic = useMemo(() => {
    if (!isBasicDataComplete || age === null || age < 18 || age > 100) return null;
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
    isBasicDataComplete,
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
    if (!isBasicDataComplete || age === null || !diagnostic) return null;
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
    isBasicDataComplete,
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
    if (!phaseRecommendation) return userSelectedPhase ?? 'recomp';
    if (
      userSelectedPhase &&
      phaseRecommendation.options[userSelectedPhase]?.enabled
    ) {
      return userSelectedPhase;
    }
    return phaseRecommendation.recommendedPhase;
  }, [userSelectedPhase, phaseRecommendation]);

  const phaseCalorieDetails = useMemo(() => {
    if (!diagnostic) return null;
    return calculateTargetCaloriesForPhase({
      activeTdee: diagnostic.initialStaticTdee,
      phase: activePhase,
      fatMassKg: diagnostic.fatMassKg,
    });
  }, [diagnostic, activePhase]);

  const hierarchicalMacros = useMemo(() => {
    if (!diagnostic || !phaseCalorieDetails) return null;
    return calculateHierarchicalMacros({
      targetKcal: phaseCalorieDetails.targetKcal,
      weightKg,
      lbmKg: diagnostic.lbmKg,
      bfPercent: diagnostic.bfPercent,
      sex,
      phase: activePhase,
    });
  }, [diagnostic, phaseCalorieDetails, weightKg, sex, activePhase]);

  const handleSaveOnboarding = () => {
    setValidationError(null);

    const finalName = name.trim() || currentUser?.fullName || '';
    if (!finalName) {
      setValidationError('Por favor ingresa tu nombre.');
      return;
    }
    if (!birthDate || age === null || age < 18 || age > 100) {
      setValidationError(
        'Ingresa una fecha válida. El plan automático está limitado a personas adultas de 18 a 100 años.'
      );
      return;
    }
    if (!Number.isFinite(heightCm) || heightCm < 120 || heightCm > 240) {
      setValidationError(
        'Ingresa tu altura real en centímetros (entre 120 y 240 cm).'
      );
      return;
    }
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) {
      setValidationError(
        'Ingresa tu peso actual real en kilogramos (entre 30 y 250 kg).'
      );
      return;
    }
    if (!phaseCalorieDetails) {
      return;
    }

    completeOnboarding({
      name: finalName,
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
    });

    if (onCompleted) {
      onCompleted();
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Cabecera Simple y Directa */}
      <div className="mb-6 flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
        <div>
          <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Configuración personalizada
          </span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
            {name.trim()
              ? `Hola, ${name.trim()} · Arma tu Plan`
              : 'Arma tu Plan Personalizado'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Ingresa tus medidas reales para calcular desde cero tus calorías, proteínas y progreso.
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

      {validationError && (
        <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-semibold text-rose-800">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{validationError}</span>
        </div>
      )}

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
                  {age !== null
                    ? `Punto de partida (${age} años)`
                    : 'Completa tus datos reales para iniciar tu cuenta desde cero'}
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
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Fecha de nacimiento
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => {
                      setBirthDate(e.target.value);
                      setValidationError(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Sexo biológico
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
                    min={120}
                    max={240}
                    step={0.5}
                    value={heightInput}
                    onChange={(e) => {
                      setHeightInput(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="Ej. 175"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-bold text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Peso actual (kg)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={250}
                    step={0.1}
                    value={weightInput}
                    onChange={(e) => {
                      setWeightInput(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="Ej. 75"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-bold text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
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
                        value={neckInput}
                        onChange={(e) => setNeckInput(e.target.value)}
                        placeholder="Ej. 38"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        Cintura (cm)
                      </label>
                      <input
                        type="number"
                        step={0.5}
                        value={waistInput}
                        onChange={(e) => setWaistInput(e.target.value)}
                        placeholder="Ej. 82"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 placeholder-slate-400"
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
                          value={hipInput}
                          onChange={(e) => setHipInput(e.target.value)}
                          placeholder="Ej. 96"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 placeholder-slate-400"
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
                  Elige la opción que mejor describa tu actividad actual
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
                Experiencia entrenando fuerza
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
          {!isBasicDataComplete ||
          !diagnostic ||
          !phaseRecommendation ||
          !hierarchicalMacros ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Target className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-extrabold text-slate-900">
                3. Cálculo en Tiempo Real de tu Plan
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                Completa tu <strong>fecha de nacimiento</strong>,{' '}
                <strong>altura (cm)</strong> y <strong>peso actual (kg)</strong>{' '}
                en el Paso 1 para calcular tus calorías, proteínas y objetivos reales sin datos de prueba.
              </p>
            </div>
          ) : (
            <>
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
                      · Masa libre de grasa:{' '}
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
                    <span className="font-bold">
                      Nuestra sugerencia según tus datos:{' '}
                    </span>
                    <span>
                      {
                        SIMPLE_PHASE_INFO[phaseRecommendation.recommendedPhase]
                          .title
                      }
                      .{' '}
                      {
                        SIMPLE_PHASE_INFO[phaseRecommendation.recommendedPhase]
                          .desc
                      }
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

              <p className="rounded-xl bg-amber-50 p-3 text-sm" role="note">Estas cifras son estimaciones orientativas, no un diagnóstico ni una prescripción. Revisa el plan con un profesional si tienes condiciones médicas, embarazo o necesidades particulares.</p>
              {hierarchicalMacros.energyAdjustmentReason && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{hierarchicalMacros.energyAdjustmentReason}</p>}
              {/* Resumen Final de tu Plan Diario */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Flame className="h-5 w-5 text-emerald-600" />
                    <h2 className="text-lg font-bold text-slate-900">
                      Tu Meta Diaria Calculada
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
                    <span className="text-xs font-bold text-amber-800">
                      Grasas
                    </span>
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

                <div className="mt-5 border-t border-slate-100 pt-4">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
