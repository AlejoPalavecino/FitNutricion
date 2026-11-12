import type {
  BiometricLog,
  EquipmentEs,
  ExerciseCatalogItem,
  MuscleGroupEs,
  NutritionalPhase,
  WorkoutRoutineExercise,
  WorkoutSession,
  WorkoutSetLog,
  WorkoutSetType,
} from '../types/nutrition';

// ============================================================================
// 1. ESTIMACIÓN DE 1RM EN TIEMPO REAL (BRZYCKI <= 10 REPS / EPLEY > 10 REPS)
// ============================================================================

/**
 * Calcula la Repetición Máxima Estimada (1RM):
 * - Ignora las series marcadas como 'warmup' (retorna 0).
 * - Para series de hasta 10 repeticiones (reps <= 10), usa la Fórmula de Brzycki:
 *   1RM = weightKg / (1.0278 - (0.0278 * reps))
 * - Para series de más de 10 repeticiones (reps > 10), usa la Fórmula de Epley:
 *   1RM = weightKg * (1 + (reps / 30))
 */
export function calculateEstimated1RM(
  weightKg: number,
  reps: number,
  setType: WorkoutSetType = 'working'
): number {
  if (setType === 'warmup' || !Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps <= 0) {
    return 0;
  }

  if (reps === 1) {
    return Number(weightKg.toFixed(1));
  }

  if (reps <= 10) {
    // Fórmula de Brzycki
    const denominator = 1.0278 - 0.0278 * reps;
    if (denominator <= 0.1) return Number(weightKg.toFixed(1));
    const brzycki1RM = weightKg / denominator;
    return Number(brzycki1RM.toFixed(1));
  }

  // Fórmula de Epley (reps > 10)
  const epley1RM = weightKg * (1 + reps / 30);
  return Number(epley1RM.toFixed(1));
}

/**
 * Calcula el tonelaje total (volumen de carga en kg) de una lista de series,
 * ignorando estrictamente las series de calentamiento ('warmup') y las no completadas.
 */
export function calculateSessionTonnageKg(sets: WorkoutSetLog[]): number {
  const total = sets.reduce((acc, s) => {
    if (!s.isCompleted || s.setType === 'warmup' || s.weightKg <= 0 || s.reps <= 0) {
      return acc;
    }
    return acc + s.weightKg * s.reps;
  }, 0);
  return Math.round(total);
}

/**
 * Evalúa los récords históricos (PR de peso y PR de 1RM) de un ejercicio antes de una fecha/sesión.
 */
export function getHistoricalExerciseBest(
  exerciseId: string,
  sessions: WorkoutSession[],
  excludeSessionId?: string
): { maxWeightKg: number; max1RMKg: number } {
  let maxWeightKg = 0;
  let max1RMKg = 0;

  for (const session of sessions) {
    if (excludeSessionId && session.id === excludeSessionId) continue;
    for (const set of session.sets) {
      if (
        set.exerciseId === exerciseId &&
        set.isCompleted &&
        set.setType !== 'warmup'
      ) {
        if (set.weightKg > maxWeightKg) {
          maxWeightKg = set.weightKg;
        }
        const rm =
          set.estimated1RM > 0
            ? set.estimated1RM
            : calculateEstimated1RM(set.weightKg, set.reps, set.setType);
        if (rm > max1RMKg) {
          max1RMKg = rm;
        }
      }
    }
  }

  return { maxWeightKg, max1RMKg };
}

// ============================================================================
// 2. MOTOR DE SUGERENCIA POR DOBLE PROGRESIÓN (GHOST TEXT)
// ============================================================================

export interface SetGhostSuggestion {
  setNumber: number;
  previousText: string; // ej. "100 kg × 8" o "Sin previo"
  previousWeightKg: number;
  previousReps: number;
  suggestedWeightKg: number;
  suggestedReps: number;
  progressionTriggered: boolean;
  suggestionNote: string;
}

export interface ExerciseDoubleProgressionPlan {
  exerciseId: string;
  hasHistory: boolean;
  allWorkingSetsHitTopOfRange: boolean;
  loadIncrementKg: number;
  summaryBanner: string;
  setSuggestions: SetGhostSuggestion[];
}

/**
 * Determina el incremento de carga según el equipamiento:
 * - +2.5 kg en ejercicios compuestos de Barra / Máquina / Multipower / Hexagonal
 * - +2.0 kg (dentro del rango +1 a 2 kg) en Mancuernas / Poleas / Pesas Rusas
 */
export function getRecommendedLoadIncrementKg(equipment: EquipmentEs): number {
  if (
    equipment === 'Barra' ||
    equipment === 'Máquina' ||
    equipment === 'Máquina Smith (Multipower)' ||
    equipment === 'Barra Hexagonal' ||
    equipment === 'Barra Z'
  ) {
    return 2.5;
  }
  if (
    equipment === 'Mancuerna' ||
    equipment === 'Polea' ||
    equipment === 'Pesa Rusa (Kettlebell)'
  ) {
    return 2.0;
  }
  return 2.0;
}

/**
 * Analiza la última sesión donde se realizó `exerciseId` y genera las sugerencias
 * de Doble Progresión serie por serie.
 */
export function getDoubleProgressionSuggestion(params: {
  routineExercise: WorkoutRoutineExercise;
  catalogItem?: ExerciseCatalogItem;
  previousSessions: WorkoutSession[];
}): ExerciseDoubleProgressionPlan {
  const { routineExercise, catalogItem, previousSessions } = params;
  const { exerciseId, targetSets, targetRepRange, progressionRule } = routineExercise;
  const [minReps, maxReps] = targetRepRange;

  // Ordenar sesiones de la más reciente a la más antigua
  const sortedSessions = [...previousSessions].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const lastSessionWithExercise = sortedSessions.find((session) =>
    session.sets.some(
      (s) => s.exerciseId === exerciseId && s.isCompleted && s.setType !== 'warmup'
    )
  );

  const incrementKg = getRecommendedLoadIncrementKg(
    catalogItem?.equipment ?? 'Barra'
  );

  if (!lastSessionWithExercise) {
    return {
      exerciseId,
      hasHistory: false,
      allWorkingSetsHitTopOfRange: false,
      loadIncrementKg: incrementKg,
      summaryBanner: `Primera vez en este ejercicio: anota el peso que utilices hoy para hacer entre ${minReps} y ${maxReps} repeticiones.`,
      setSuggestions: Array.from({ length: targetSets }, (_, idx) => ({
        setNumber: idx + 1,
        previousText: 'Sin registro previo',
        previousWeightKg: 0,
        previousReps: minReps,
        suggestedWeightKg: 0,
        suggestedReps: minReps,
        progressionTriggered: false,
        suggestionNote: `Meta inicial: ${minReps}-${maxReps} reps`,
      })),
    };
  }

  const lastWorkingSets = lastSessionWithExercise.sets.filter(
    (s) => s.exerciseId === exerciseId && s.isCompleted && s.setType === 'working'
  );

  const referenceSets =
    lastWorkingSets.length > 0
      ? lastWorkingSets
      : lastSessionWithExercise.sets.filter(
          (s) => s.exerciseId === exerciseId && s.isCompleted && s.setType !== 'warmup'
        );

  // Verificar si TODAS las series de trabajo alcanzaron o superaron el límite superior del targetRepRange
  const allWorkingSetsHitTopOfRange =
    lastWorkingSets.length >= targetSets && lastWorkingSets.every((s) => s.reps >= maxReps && Number.isFinite(s.weightKg) && s.weightKg > 0);

  const topWorkingWeight =
    referenceSets.length > 0
      ? Math.max(...referenceSets.map((s) => s.weightKg))
      : 40;

  if (progressionRule !== 'none' && allWorkingSetsHitTopOfRange) {
    const nextWeight = Number((topWorkingWeight + incrementKg).toFixed(1));
    return {
      exerciseId,
      hasHistory: true,
      allWorkingSetsHitTopOfRange: true,
      loadIncrementKg: incrementKg,
      summaryBanner: `🔥 Sobrecarga desbloqueada: lograste ≥${maxReps} reps en todas las series previas. Sube +${incrementKg} kg (${nextWeight} kg) y reinicia a ${minReps} reps.`,
      setSuggestions: Array.from({ length: targetSets }, (_, idx) => {
        const prev = referenceSets[idx] ?? referenceSets[referenceSets.length - 1];
        return {
          setNumber: idx + 1,
          previousText: `${prev.weightKg} kg × ${prev.reps}`,
          previousWeightKg: prev.weightKg,
          previousReps: prev.reps,
          suggestedWeightKg: Number((prev.weightKg + incrementKg).toFixed(1)),
          suggestedReps: minReps,
          progressionTriggered: true,
          suggestionNote: `+${incrementKg} kg y reinicio al piso (${minReps} reps)`,
        };
      }),
    };
  }

  // Si aún no alcanzó el tope en todas las series: mantener weightKg e intentar +1 rep
  return {
    exerciseId,
    hasHistory: true,
    allWorkingSetsHitTopOfRange: false,
    loadIncrementKg: 0,
    summaryBanner: `Mantén ${topWorkingWeight} kg e intenta añadir +1 repetición por serie hasta completar ${targetSets}×${maxReps}.`,
    setSuggestions: Array.from({ length: targetSets }, (_, idx) => {
      const prev = referenceSets[idx] ?? referenceSets[referenceSets.length - 1];
      const nextReps = Math.min(maxReps, prev.reps + 1);
      return {
        setNumber: idx + 1,
        previousText: `${prev.weightKg} kg × ${prev.reps}`,
        previousWeightKg: prev.weightKg,
        previousReps: prev.reps,
        suggestedWeightKg: prev.weightKg,
        suggestedReps: nextReps,
        progressionTriggered: false,
        suggestionNote:
          nextReps > prev.reps
            ? `Mantener ${prev.weightKg} kg · Buscar +1 rep (${nextReps})`
            : `Consolidar ${prev.weightKg} kg × ${maxReps} reps`,
      };
    }),
  };
}

// ============================================================================
// 3. RASTREADOR DE VOLUMEN SEMANAL POR GRUPO MUSCULAR (SERIES EFECTIVAS)
// ============================================================================

export type VolumeZoneStatus = 'sub_mv' | 'mv' | 'mev' | 'mav' | 'mrv_risk';

export interface MuscleWeeklyVolumeItem {
  muscle: MuscleGroupEs;
  directSets: number; // +1.0 por serie primaria
  fractionalSets: number; // +0.5 por serie secundaria
  totalEffectiveSets: number;
  zone: VolumeZoneStatus;
  zoneLabel: string;
  zoneDescription: string;
}

export const ALL_MUSCLE_GROUPS_ES: MuscleGroupEs[] = [
  'Pecho',
  'Espalda / Dorsales',
  'Hombros (Deltoides)',
  'Cuádriceps',
  'Isquiotibiales',
  'Glúteos',
  'Bíceps',
  'Tríceps',
  'Trapecios',
  'Gemelos / Pantorrillas',
  'Abdominales / Core',
  'Espalda Baja / Lumbares',
  'Antebrazos',
  'Aductores',
  'Abductores',
];

export function classifyHypertrophyVolumeZone(effectiveSets: number): {
  zone: VolumeZoneStatus;
  zoneLabel: string;
  zoneDescription: string;
} {
  if (effectiveSets > 22) {
    return {
      zone: 'mrv_risk',
      zoneLabel: 'MRV (>22 · Riesgo Fatiga)',
      zoneDescription: 'Supera el Volumen Máximo Recuperable (>22 series/sem). Vigila recuperación articular.',
    };
  }
  if (effectiveSets >= 12) {
    return {
      zone: 'mav',
      zoneLabel: 'MAV (12-20 · Zona Óptima)',
      zoneDescription: 'Volumen Adaptativo Máximo: estímulo óptimo de hipertrofia miofibrilar.',
    };
  }
  if (effectiveSets >= 8) {
    return {
      zone: 'mev',
      zoneLabel: 'MEV (8-10 · Efectivo Mínimo)',
      zoneDescription: 'Volumen Efectivo Mínimo para inducir ganancias medibles.',
    };
  }
  if (effectiveSets >= 4) {
    return {
      zone: 'mv',
      zoneLabel: 'MV (4-6 · Mantenimiento)',
      zoneDescription: 'Volumen de Mantenimiento: preserva masa contráctil (útil en déficit o descarga).',
    };
  }
  return {
    zone: 'sub_mv',
    zoneLabel: '< 4 series/sem',
    zoneDescription: 'Por debajo del umbral de mantenimiento semanal.',
  };
}

/**
 * Calcula las series efectivas ('working' o 'failure' completadas) de los últimos `daysWindow` (default 7 días):
 * - +1.0 serie al `primaryMuscle`
 * - +0.5 series a cada músculo en `secondaryMuscles`
 */
export function calculateWeeklyMuscleVolume(params: {
  sessions: WorkoutSession[];
  catalog: ExerciseCatalogItem[];
  referenceDateStr?: string;
  daysWindow?: number;
}): MuscleWeeklyVolumeItem[] {
  const { sessions, catalog, referenceDateStr, daysWindow = 7 } = params;
  const catalogMap = new Map(catalog.map((c) => [c.id, c]));

  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const cutoffTime = refDate.getTime() - (daysWindow - 1) * 24 * 60 * 60 * 1000;

  const statsMap = new Map<
    MuscleGroupEs,
    { direct: number; fractional: number }
  >();
  for (const m of ALL_MUSCLE_GROUPS_ES) {
    statsMap.set(m, { direct: 0, fractional: 0 });
  }

  for (const session of sessions) {
    const sessionTime = new Date(session.date).getTime();
    if (sessionTime < cutoffTime || sessionTime > refDate.getTime() + 86400000) {
      continue;
    }

    for (const set of session.sets) {
      if (
        !set.isCompleted ||
        (set.setType !== 'working' && set.setType !== 'failure')
      ) {
        continue;
      }

      const ex = catalogMap.get(set.exerciseId);
      if (!ex) continue;

      const primaryRecord = statsMap.get(ex.primaryMuscle);
      if (primaryRecord) {
        primaryRecord.direct += 1.0;
      }

      for (const secMuscle of ex.secondaryMuscles) {
        const secRecord = statsMap.get(secMuscle);
        if (secRecord) {
          secRecord.fractional += 0.5;
        }
      }
    }
  }

  return ALL_MUSCLE_GROUPS_ES.map((muscle) => {
    const rec = statsMap.get(muscle) ?? { direct: 0, fractional: 0 };
    const totalEffectiveSets = Number((rec.direct + rec.fractional).toFixed(1));
    const classification = classifyHypertrophyVolumeZone(totalEffectiveSets);

    return {
      muscle,
      directSets: rec.direct,
      fractionalSets: rec.fractional,
      totalEffectiveSets,
      ...classification,
    };
  });
}

// ============================================================================
// 4. SINERGIA CON EL MOTOR DE NUTRICIÓN (PERI-ENTRENO Y CURVA EWMA VS 1RM)
// ============================================================================

export interface PeriWorkoutNutritionPlan {
  hasWorkoutToday: boolean;
  sessionsCountToday: number;
  totalVolumeKgToday: number;
  minPostWorkoutProteinG: number; // >= 0.4 g/kg
  recommendedPreWorkoutCarbsG: number;
  recommendedPostWorkoutCarbsG: number;
  recommendationTitle: string;
  recommendationDetails: string;
}

/**
 * Calcula la prescripción nutricional peri-entrenamiento cuando hay una WorkoutSession en el día:
 * - Al menos 0.4 g/kg de proteína post-entreno.
 * - Priorización de carbohidratos de fácil digestión antes y después de entrenar.
 */
export function calculatePeriWorkoutNutrition(params: {
  date: string;
  bodyweightKg: number;
  dailyTargetCarbsG: number;
  sessions: WorkoutSession[];
}): PeriWorkoutNutritionPlan {
  const { date, bodyweightKg, dailyTargetCarbsG, sessions } = params;
  const todaysSessions = sessions.filter((s) => s.date === date);
  const hasWorkoutToday = todaysSessions.length > 0;
  const totalVolumeKgToday = todaysSessions.reduce(
    (sum, s) => sum + s.totalVolumeKg,
    0
  );

  // Mínimo 0.4 g/kg de proteína post-entreno (umbral de leucina y síntesis proteica miofibrilar)
  const minPostWorkoutProteinG = Math.max(25, Math.round(bodyweightKg * 0.4));
  // Distribución peri-entreno de carbohidratos (pre ~25%, post ~35% de la cuota diaria o ~1g/kg)
  const recommendedPreWorkoutCarbsG = Math.max(
    30,
    Math.round(Math.min(dailyTargetCarbsG * 0.25, bodyweightKg * 1.0))
  );
  const recommendedPostWorkoutCarbsG = Math.max(
    40,
    Math.round(Math.min(dailyTargetCarbsG * 0.35, bodyweightKg * 1.2))
  );

  if (!hasWorkoutToday) {
    return {
      hasWorkoutToday: false,
      sessionsCountToday: 0,
      totalVolumeKgToday: 0,
      minPostWorkoutProteinG,
      recommendedPreWorkoutCarbsG,
      recommendedPostWorkoutCarbsG,
      recommendationTitle: 'Día de Descanso / Recuperación Sistémica',
      recommendationDetails: `Sin sesión de fuerza registrada hoy. Distribuye tu proteína en 3-4 tomas equitativas de ≥${minPostWorkoutProteinG}g (0.4 g/kg) priorizando carbohidratos complejos fibrosos.`,
    };
  }

  return {
    hasWorkoutToday: true,
    sessionsCountToday: todaysSessions.length,
    totalVolumeKgToday,
    minPostWorkoutProteinG,
    recommendedPreWorkoutCarbsG,
    recommendedPostWorkoutCarbsG,
    recommendationTitle: `Sinergia Peri-Entrenamiento Activa (${totalVolumeKgToday.toLocaleString()} kg movidos hoy)`,
    recommendationDetails: `Prioriza ${recommendedPreWorkoutCarbsG}g de carbohidratos de fácil digestión 60-90 min antes de entrenar, y asegura al menos ${minPostWorkoutProteinG}g de proteína (≥0.4 g/kg) + ${recommendedPostWorkoutCarbsG}g de carbohidratos rápidos en tu comida post-entreno para maximizar la síntesis proteica y resíntesis de glucógeno.`,
  };
}

export interface EwmaVs1RMPoint {
  date: string;
  trendWeightKg: number | null;
  scaleWeightKg: number | null;
  estimated1RM: number | null;
  maxSessionWeightKg: number | null;
}

export interface StrengthBodyweightSynergyReport {
  exerciseId: string;
  points: EwmaVs1RMPoint[];
  weightTrendDeltaKg: number;
  oneRmDeltaKg: number;
  oneRmDeltaPercent: number;
  isSuccessfulRecompOrRetention: boolean;
  synergyBadgeTitle: string;
  synergyExplanation: string;
}

/**
 * Superpone la curva de Peso Corporal en Tendencia (EWMA) con el 1RM Estimado de un ejercicio principal
 * y detecta "Retención Muscular / Recomposición Exitosa" cuando el usuario baja de peso EWMA o está en
 * Déficit/Recomp mientras mantiene o incrementa su fuerza (1RM).
 */
export function evaluateStrengthBodyweightSynergy(params: {
  exerciseId: string;
  biometricLogs: BiometricLog[];
  workoutSessions: WorkoutSession[];
  currentPhase: NutritionalPhase;
}): StrengthBodyweightSynergyReport {
  const { exerciseId, biometricLogs, workoutSessions, currentPhase } = params;

  const bioByDate = new Map(biometricLogs.map((b) => [b.date, b]));
  const oneRmByDate = new Map<string, { best1RM: number; bestWeight: number }>();

  for (const session of workoutSessions) {
    let best1RM = 0;
    let bestWeight = 0;
    for (const set of session.sets) {
      if (
        set.exerciseId === exerciseId &&
        set.isCompleted &&
        set.setType !== 'warmup'
      ) {
        const rm =
          set.estimated1RM > 0
            ? set.estimated1RM
            : calculateEstimated1RM(set.weightKg, set.reps, set.setType);
        if (rm > best1RM) best1RM = rm;
        if (set.weightKg > bestWeight) bestWeight = set.weightKg;
      }
    }
    if (best1RM > 0) {
      const prev = oneRmByDate.get(session.date);
      if (!prev || best1RM > prev.best1RM) {
        oneRmByDate.set(session.date, { best1RM, bestWeight });
      }
    }
  }

  const allDates = Array.from(
    new Set([...bioByDate.keys(), ...oneRmByDate.keys()])
  ).sort((a, b) => a.localeCompare(b));

  let lastKnownTrend: number | null = null;
  let lastKnown1RM: number | null = null;

  const points: EwmaVs1RMPoint[] = allDates.map((date) => {
    const bio = bioByDate.get(date);
    const strength = oneRmByDate.get(date);
    if (bio) lastKnownTrend = bio.trendWeightKg;
    if (strength) lastKnown1RM = strength.best1RM;

    return {
      date,
      trendWeightKg: bio?.trendWeightKg ?? lastKnownTrend,
      scaleWeightKg: bio?.scaleWeightKg ?? null,
      estimated1RM: strength?.best1RM ?? lastKnown1RM,
      maxSessionWeightKg: strength?.bestWeight ?? null,
    };
  });

  const validBio = [...biometricLogs].sort((a, b) => a.date.localeCompare(b.date));
  const weightTrendDeltaKg =
    validBio.length >= 2
      ? Number(
          (
            validBio[validBio.length - 1].trendWeightKg - validBio[0].trendWeightKg
          ).toFixed(2)
        )
      : 0;

  const valid1RMs = Array.from(oneRmByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((e) => e[1].best1RM);

  const oneRmDeltaKg =
    valid1RMs.length >= 2
      ? Number((valid1RMs[valid1RMs.length - 1] - valid1RMs[0]).toFixed(1))
      : 0;
  const oneRmDeltaPercent =
    valid1RMs.length >= 2 && valid1RMs[0] > 0
      ? Number(((oneRmDeltaKg / valid1RMs[0]) * 100).toFixed(1))
      : 0;

  const isLosingTrendWeight =
    weightTrendDeltaKg <= -0.1 || currentPhase === 'cut' || currentPhase === 'recomp';
  const isMaintainingOrGainingStrength = oneRmDeltaKg >= -0.5;

  const isSuccessfulRecompOrRetention =
    valid1RMs.length >= 2 && isLosingTrendWeight && isMaintainingOrGainingStrength;

  let synergyBadgeTitle = 'Monitoreo Biométrico + Fuerza Activo';
  let synergyExplanation =
    'Registra más sesiones de este movimiento para correlacionar la tendencia EWMA con tu 1RM estimado.';

  if (isSuccessfulRecompOrRetention) {
    synergyBadgeTitle = 'Retención Muscular / Recomposición Exitosa';
    synergyExplanation = `Tu peso en tendencia EWMA varió ${weightTrendDeltaKg > 0 ? '+' : ''}${weightTrendDeltaKg} kg mientras tu 1RM estimado evolucionó ${oneRmDeltaKg >= 0 ? '+' : ''}${oneRmDeltaKg} kg (${oneRmDeltaPercent >= 0 ? '+' : ''}${oneRmDeltaPercent}%). Estás oxidando tejido adiposo preservando o ganando tejido contráctil.`;
  } else if (valid1RMs.length >= 2 && oneRmDeltaKg > 0) {
    synergyBadgeTitle = 'Sobrecarga Progresiva Confirmada';
    synergyExplanation = `Tu 1RM estimado subió +${oneRmDeltaKg} kg (+${oneRmDeltaPercent}%) acompañando una variación de peso en tendencia de ${weightTrendDeltaKg >= 0 ? '+' : ''}${weightTrendDeltaKg} kg.`;
  }

  return {
    exerciseId,
    points,
    weightTrendDeltaKg,
    oneRmDeltaKg,
    oneRmDeltaPercent,
    isSuccessfulRecompOrRetention,
    synergyBadgeTitle,
    synergyExplanation,
  };
}
