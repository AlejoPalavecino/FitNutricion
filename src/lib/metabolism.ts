import type {
  BiologicalSex,
  BiometricLog,
  BmrFormula,
  BodyFatMethod,
  FoodItem,
  MacroBreakdown,
  NutritionalPhase,
  Recipe,
  TrainingExperience,
} from '../types/nutrition';

// ============================================================================
// CONSTANTES FISIOLÓGICAS Y BIOMÉTRICAS
// ============================================================================

export const KCAL_PER_GRAM_PROTEIN = 4;
export const KCAL_PER_GRAM_CARBS = 4;
export const KCAL_PER_GRAM_FAT = 9;
export const KCAL_PER_KG_ADIPOSE_TISSUE = 7700;
export const MAX_LIPOLYSIS_KCAL_PER_KG_FAT = 68; // Alpert (2005): ~68 kcal/kg grasa/día (~290 kJ/kg)
export const MAX_CUT_DEFICIT_PERCENT = 0.25;
export const DEFAULT_CUT_DEFICIT_PERCENT = 0.20;
export const DEFAULT_RECOMP_DEFICIT_PERCENT = 0.125; // Rango -10% a -15%
export const DEFAULT_BULK_SURPLUS_PERCENT = 0.12; // Rango +10% a +15%
export const WEEKLY_TDEE_DAMPING_MAX_PCT = 0.05; // Amortiguador ±5% semanal

// ============================================================================
// 1. MÓDULO ANTROPOMÉTRICO (US NAVY, BOER 1984, LBM, WHtR)
// ============================================================================

export interface AnthropometricInput {
  sex: BiologicalSex;
  age: number;
  heightCm: number;
  weightKg: number;
  pal: number; // 1.2 - 1.9
  trainingExperience: TrainingExperience;
  returningFromInactivity?: boolean;
  weeksInCurrentDeficit?: number;
  goalPhysiqueReached?: boolean;
  neckCm?: number;
  waistCm?: number;
  hipCm?: number; // Requerido en mujeres para US Navy
}

export interface AnthropometricDiagnostic {
  bfPercent: number;
  bfMethod: BodyFatMethod;
  verifiedByTape: boolean;
  lbmKg: number;
  fatMassKg: number;
  whtr?: number;
  isWhtrAlert: boolean;
  bmrKcal: number;
  bmrFormula: BmrFormula;
  bmrReason: string;
  initialStaticTdee: number;
  maxSafeDeficitKcalByLipolysis: number;
}

/**
 * Calcula la edad en años cumplidos a partir de la fecha de nacimiento (YYYY-MM-DD).
 */
export function calculateAgeFromBirthDate(birthDate: string, referenceDateStr?: string): number {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 28;
  const ref = referenceDateStr ? new Date(referenceDateStr) : new Date();
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) {
    age--;
  }
  return Math.max(14, Math.min(100, age));
}

/**
 * Método US Navy para el cálculo de % de Grasa Corporal (BF%).
 * Hombres: BF% = 495 / (1.0324 - 0.19077 * log10(cintura - cuello) + 0.15456 * log10(altura)) - 450
 * Mujeres: BF% = 495 / (1.29579 - 0.35004 * log10(cintura + cadera - cuello) + 0.22100 * log10(altura)) - 450
 */
export function calculateUsNavyBodyFat(params: {
  sex: BiologicalSex;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  hipCm?: number;
}): number {
  const { sex, heightCm, waistCm, neckCm, hipCm } = params;
  if (heightCm <= 0 || waistCm <= 0 || neckCm <= 0) {
    throw new Error('Las medidas de altura, cintura y cuello deben ser mayores a 0 cm.');
  }

  let rawBf: number;

  if (sex === 'male') {
    const diff = waistCm - neckCm;
    if (diff <= 0) {
      throw new Error('El perímetro de cintura debe ser mayor que el perímetro de cuello.');
    }
    const denominator =
      1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm);
    rawBf = 495 / denominator - 450;
  } else {
    if (!hipCm || hipCm <= 0) {
      throw new Error('El perímetro de cadera es obligatorio para el cálculo US Navy en mujeres.');
    }
    const sumDiff = waistCm + hipCm - neckCm;
    if (sumDiff <= 0) {
      throw new Error('La suma de cintura y cadera debe ser mayor que el cuello.');
    }
    const denominator =
      1.29579 - 0.35004 * Math.log10(sumDiff) + 0.22100 * Math.log10(heightCm);
    rawBf = 495 / denominator - 450;
  }

  // Clamping fisiológico seguro (3.5% a 60%)
  return Number(Math.max(3.5, Math.min(60, rawBf)).toFixed(2));
}

/**
 * Fallback: Fórmula de Boer (1984) para estimar la Masa Corporal Magra (LBM)
 * cuando el usuario no ingresa medidas perimetrales con cinta métrica.
 * Hombres: LBM = (0.407 * peso) + (0.267 * altura) - 19.2
 * Mujeres: LBM = (0.252 * peso) + (0.473 * altura) - 48.3
 */
export function calculateBoerLbm(params: {
  sex: BiologicalSex;
  weightKg: number;
  heightCm: number;
}): number {
  const { sex, weightKg, heightCm } = params;
  const rawLbm =
    sex === 'male'
      ? 0.407 * weightKg + 0.267 * heightCm - 19.2
      : 0.252 * weightKg + 0.473 * heightCm - 48.3;

  // Garantizar que LBM esté dentro de límites biológicos razonables respecto al peso total
  const minLbm = weightKg * 0.42;
  const maxLbm = weightKg * 0.95;
  return Number(Math.max(minLbm, Math.min(maxLbm, rawLbm)).toFixed(2));
}

/**
 * Cálculo de Masa Corporal Magra (LBM) a partir del peso y BF%:
 * LBM = peso * (1 - (BF% / 100))
 */
export function calculateLbmFromBodyFat(weightKg: number, bfPercent: number): number {
  const lbm = weightKg * (1 - bfPercent / 100);
  return Number(Math.max(0, lbm).toFixed(2));
}

/**
 * Cálculo del Índice Cintura-Altura (WHtR = cintura / altura).
 * Alerta cardiometabólica y de prioridad de déficit si WHtR > 0.50.
 */
export function calculateWhtr(waistCm: number, heightCm: number): number {
  if (heightCm <= 0 || waistCm <= 0) return 0;
  return Number((waistCm / heightCm).toFixed(3));
}

/**
 * Conmutador de Tasa Metabólica Basal (BMR):
 * - Si BF% <= 20% (Hombres) o <= 28% (Mujeres) VERIFICADO POR MEDIDAS:
 *   Usar Katch-McArdle: BMR = 370 + (21.6 * LBM)
 * - En caso contrario:
 *   Usar Mifflin-St Jeor:
 *   Hombres: BMR = (10 * peso) + (6.25 * altura) - (5 * edad) + 5
 *   Mujeres: BMR = (10 * peso) + (6.25 * altura) - (5 * edad) - 161
 */
export function calculateBmr(params: {
  sex: BiologicalSex;
  weightKg: number;
  heightCm: number;
  age: number;
  bfPercent: number;
  lbmKg: number;
  verifiedByTape: boolean;
}): { bmrKcal: number; formula: BmrFormula; reason: string } {
  const { sex, weightKg, heightCm, age, bfPercent, lbmKg, verifiedByTape } = params;

  const isLeanEnoughForKatch =
    (sex === 'male' && bfPercent <= 20) || (sex === 'female' && bfPercent <= 28);

  if (verifiedByTape && isLeanEnoughForKatch) {
    const katchBmr = 370 + 21.6 * lbmKg;
    return {
      bmrKcal: Math.round(katchBmr),
      formula: 'katch_mcardle',
      reason: `Katch-McArdle activado: BF% verificado por cinta (${bfPercent.toFixed(1)}%) ≤ umbral (${sex === 'male' ? '20%' : '28%'}) con LBM de ${lbmKg.toFixed(1)} kg.`,
    };
  }

  const mifflinBmr =
    sex === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const reason = !verifiedByTape
    ? 'Mifflin-St Jeor activado: Sin medidas perimetrales verificadas (LBM estimado por Boer).'
    : `Mifflin-St Jeor activado: BF% (${bfPercent.toFixed(1)}%) superior al umbral de Katch-McArdle (${sex === 'male' ? '20%' : '28%'}), evitando sobreestimación por tejido adiposo.`;

  return {
    bmrKcal: Math.round(mifflinBmr),
    formula: 'mifflin_st_jeor',
    reason,
  };
}

/**
 * Evalúa el perfil antropométrico completo del usuario.
 */
export function evaluateAnthropometrics(input: AnthropometricInput): AnthropometricDiagnostic {
  const { sex, age, heightCm, weightKg, pal, neckCm, waistCm, hipCm } = input;

  const hasValidMaleTape =
    sex === 'male' &&
    typeof neckCm === 'number' &&
    neckCm > 20 &&
    typeof waistCm === 'number' &&
    waistCm > neckCm;

  const hasValidFemaleTape =
    sex === 'female' &&
    typeof neckCm === 'number' &&
    neckCm > 20 &&
    typeof waistCm === 'number' &&
    waistCm > 40 &&
    typeof hipCm === 'number' &&
    hipCm > 50 &&
    waistCm + hipCm > neckCm;

  const verifiedByTape = hasValidMaleTape || hasValidFemaleTape;

  let bfPercent: number;
  let lbmKg: number;
  let bfMethod: BodyFatMethod;

  if (verifiedByTape && neckCm && waistCm) {
    bfPercent = calculateUsNavyBodyFat({
      sex,
      heightCm,
      waistCm,
      neckCm,
      hipCm,
    });
    lbmKg = calculateLbmFromBodyFat(weightKg, bfPercent);
    bfMethod = 'us_navy';
  } else {
    lbmKg = calculateBoerLbm({ sex, weightKg, heightCm });
    bfPercent = Number((((weightKg - lbmKg) / weightKg) * 100).toFixed(2));
    bfMethod = 'boer_fallback';
  }

  const fatMassKg = Number(Math.max(0, weightKg - lbmKg).toFixed(2));
  const whtr = waistCm && waistCm > 0 ? calculateWhtr(waistCm, heightCm) : undefined;
  const isWhtrAlert = whtr !== undefined && whtr > 0.5;

  const { bmrKcal, formula: bmrFormula, reason: bmrReason } = calculateBmr({
    sex,
    weightKg,
    heightCm,
    age,
    bfPercent,
    lbmKg,
    verifiedByTape,
  });

  const safePal = Math.max(1.2, Math.min(1.9, pal));
  const initialStaticTdee = Math.round(bmrKcal * safePal);
  const maxSafeDeficitKcalByLipolysis = Math.round(fatMassKg * MAX_LIPOLYSIS_KCAL_PER_KG_FAT);

  return {
    bfPercent,
    bfMethod,
    verifiedByTape,
    lbmKg,
    fatMassKg,
    whtr,
    isWhtrAlert,
    bmrKcal,
    bmrFormula,
    bmrReason,
    initialStaticTdee,
    maxSafeDeficitKcalByLipolysis,
  };
}

// ============================================================================
// 2. ÁRBOL DE DECISIÓN DE FASE NUTRICIONAL Y OBJETIVO CALÓRICO
// ============================================================================

export interface PhaseOptionDetail {
  phase: NutritionalPhase;
  title: string;
  subtitle: string;
  recommended: boolean;
  priorityAlert: boolean;
  enabled: boolean;
  disabledReason?: string;
  defaultAdjustmentPercent: number; // ej. -0.20, -0.125, 0, +0.12
  minAdjustmentPercent: number;
  maxAdjustmentPercent: number;
  targetKcal: number;
  effectiveDeficitOrSurplusKcal: number;
  cappedByLipolysis: boolean;
  rationale: string;
}

export interface PhaseRecommendationResult {
  recommendedPhase: NutritionalPhase;
  primaryReason: string;
  whtrPriorityTriggered: boolean;
  options: Record<NutritionalPhase, PhaseOptionDetail>;
}

/**
 * Calcula las calorías objetivo para una fase específica respetando:
 * - En Déficit ('cut'): ajuste base de -20%, NUNCA superar -25% ni el límite de lipólisis máxima
 *   de 68 kcal por cada kg de grasa corporal total.
 * - En Recomposición ('recomp'): -10% a -15% sobre el TDEE (default -12.5%).
 * - En Volumen Limpio ('bulk'): +12% sobre el TDEE (rango +10% a +15%).
 * - En Mantenimiento ('maintenance'): 0% sobre el TDEE.
 */
export function calculateTargetCaloriesForPhase(params: {
  activeTdee: number;
  phase: NutritionalPhase;
  fatMassKg: number;
  customAdjustmentPercent?: number;
}): {
  targetKcal: number;
  appliedAdjustmentPercent: number;
  deltaKcal: number;
  cappedByLipolysis: boolean;
  maxLipolysisDeficitKcal: number;
} {
  const { activeTdee, phase, fatMassKg, customAdjustmentPercent } = params;
  const maxLipolysisDeficitKcal = Math.round(Math.max(250, fatMassKg * MAX_LIPOLYSIS_KCAL_PER_KG_FAT));

  if (phase === 'cut') {
    const requestedPct =
      customAdjustmentPercent !== undefined
        ? Math.max(-MAX_CUT_DEFICIT_PERCENT, Math.min(-0.10, customAdjustmentPercent))
        : -DEFAULT_CUT_DEFICIT_PERCENT;

    const desiredDeficitKcal = Math.round(activeTdee * Math.abs(requestedPct));
    const maxPctDeficitKcal = Math.round(activeTdee * MAX_CUT_DEFICIT_PERCENT);
    const effectiveDeficitKcal = Math.min(desiredDeficitKcal, maxPctDeficitKcal, maxLipolysisDeficitKcal);
    const cappedByLipolysis = maxLipolysisDeficitKcal < desiredDeficitKcal;
    const targetKcal = Math.max(1000, activeTdee - effectiveDeficitKcal);

    return {
      targetKcal,
      appliedAdjustmentPercent: Number((-(effectiveDeficitKcal / activeTdee)).toFixed(4)),
      deltaKcal: -effectiveDeficitKcal,
      cappedByLipolysis,
      maxLipolysisDeficitKcal,
    };
  }

  if (phase === 'recomp') {
    const requestedPct =
      customAdjustmentPercent !== undefined
        ? Math.max(-0.15, Math.min(-0.10, customAdjustmentPercent))
        : -DEFAULT_RECOMP_DEFICIT_PERCENT;

    const desiredDeficitKcal = Math.min(
      Math.round(activeTdee * Math.abs(requestedPct)),
      maxLipolysisDeficitKcal
    );
    const targetKcal = Math.max(1100, activeTdee - desiredDeficitKcal);

    return {
      targetKcal,
      appliedAdjustmentPercent: Number((-(desiredDeficitKcal / activeTdee)).toFixed(4)),
      deltaKcal: -desiredDeficitKcal,
      cappedByLipolysis: maxLipolysisDeficitKcal < Math.round(activeTdee * Math.abs(requestedPct)),
      maxLipolysisDeficitKcal,
    };
  }

  if (phase === 'bulk') {
    const requestedPct =
      customAdjustmentPercent !== undefined
        ? Math.max(0.10, Math.min(0.15, customAdjustmentPercent))
        : DEFAULT_BULK_SURPLUS_PERCENT;

    const surplusKcal = Math.round(activeTdee * requestedPct);
    const targetKcal = activeTdee + surplusKcal;

    return {
      targetKcal,
      appliedAdjustmentPercent: Number(requestedPct.toFixed(4)),
      deltaKcal: surplusKcal,
      cappedByLipolysis: false,
      maxLipolysisDeficitKcal,
    };
  }

  // Maintenance
  return {
    targetKcal: activeTdee,
    appliedAdjustmentPercent: 0,
    deltaKcal: 0,
    cappedByLipolysis: false,
    maxLipolysisDeficitKcal,
  };
}

/**
 * Árbol de Decisión Estricto para Recomendar Fase Nutricional (Sin usar IMC).
 */
export function recommendNutritionalPhase(
  input: AnthropometricInput,
  diagnostic?: AnthropometricDiagnostic
): PhaseRecommendationResult {
  const diag = diagnostic ?? evaluateAnthropometrics(input);
  const { sex, trainingExperience, returningFromInactivity, weeksInCurrentDeficit, goalPhysiqueReached } =
    input;
  const { bfPercent, fatMassKg, whtr, isWhtrAlert, initialStaticTdee } = diag;

  // 1. Evaluar criterios de Déficit Calórico (Cut)
  const isMaleCut = sex === 'male' && bfPercent > 20;
  const isMalePriorityCut = sex === 'male' && bfPercent > 25;
  const isFemaleCut = sex === 'female' && bfPercent > 30;
  const isFemalePriorityCut = sex === 'female' && bfPercent > 32;
  const shouldCut = isMaleCut || isFemaleCut || isWhtrAlert;
  const isPriorityCut = isMalePriorityCut || isFemalePriorityCut || isWhtrAlert;

  // 2. Evaluar criterios de Recomposición Corporal (Recomp)
  const isNoviceOrReturning = trainingExperience === 'novice' || Boolean(returningFromInactivity);
  const isModerateAdiposity =
    (sex === 'male' && bfPercent >= 15 && bfPercent <= 22) ||
    (sex === 'female' && bfPercent >= 24 && bfPercent <= 30);
  const isBridgeRange =
    (sex === 'male' && bfPercent > 15 && bfPercent <= 20) ||
    (sex === 'female' && bfPercent > 25 && bfPercent <= 30);
  const shouldRecomp =
    !isPriorityCut && ((isNoviceOrReturning && isModerateAdiposity) || (!shouldCut && isBridgeRange));

  // 3. Evaluar criterios de Volumen Limpio (Lean Bulk)
  // Habilitar/Recomendar únicamente si Hombres BF% entre 10% y 15% (o <10%) o Mujeres BF% entre 20% y 25% (o <20%)
  const isLeanBulkEligible =
    !isWhtrAlert &&
    ((sex === 'male' && bfPercent <= 15) || (sex === 'female' && bfPercent <= 25));

  // 4. Evaluar criterios de Mantenimiento Dinámico
  const needsDietBreak = (weeksInCurrentDeficit ?? 0) > 12 || Boolean(goalPhysiqueReached);

  // Determinar Fase Principal Recomendada siguiendo la jerarquía clínica y deportiva
  let recommendedPhase: NutritionalPhase = 'maintenance';
  let primaryReason = '';

  if (needsDietBreak && !isPriorityCut) {
    recommendedPhase = 'maintenance';
    primaryReason =
      (weeksInCurrentDeficit ?? 0) > 12
        ? `Has acumulado ${weeksInCurrentDeficit} semanas en déficit (>12 semanas). Se recomienda una fase de Mantenimiento Dinámico para restaurar leptina, T3 y rendimiento.`
        : 'Has alcanzado tu físico objetivo. El Mantenimiento Dinámico consolidará tu composición corporal mientras el motor adaptativo calibra tu gasto real.';
  } else if (isPriorityCut) {
    recommendedPhase = 'cut';
    if (isWhtrAlert && whtr) {
      primaryReason = `Prioridad metabólica: Tu índice Cintura-Altura (WHtR = ${whtr.toFixed(2)}) supera el umbral de 0.50, indicando prioridad de reducción de grasa visceral mediante Déficit Calórico controlado (-20%).`;
    } else {
      primaryReason = `Con un ${bfPercent.toFixed(1)}% de grasa corporal estimado (${sex === 'male' ? '>25%' : '>32%'}), la prioridad fisiológica es un Déficit Calórico estructurado (-20%) para optimizar sensibilidad a la insulina y salud metabólica.`;
    }
  } else if (shouldRecomp) {
    recommendedPhase = 'recomp';
    primaryReason = isNoviceOrReturning
      ? `Al ser ${returningFromInactivity ? 'un atleta retomando tras inactividad' : 'novato en fuerza'} con adiposidad moderada (${bfPercent.toFixed(1)}%), tienes alto potencial para oxidar grasa y sintetizar masa contráctil simultáneamente con un ligero ajuste de -12.5%.`
      : `Con un ${bfPercent.toFixed(1)}% de grasa corporal (zona intermedia), una Recomposición Corporal (-12.5% kcal y proteína a 2.2 g/kg) te llevará al rango óptimo de definición sin sacrificar rendimiento.`;
  } else if (shouldCut) {
    recommendedPhase = 'cut';
    primaryReason = `Tu porcentaje graso (${bfPercent.toFixed(1)}%) supera el umbral de ${sex === 'male' ? '20%' : '30%'}. Se recomienda un Déficit Calórico del -20% antes de plantear una etapa de superávit.`;
  } else if (isLeanBulkEligible) {
    recommendedPhase = 'bulk';
    primaryReason = `Tu porcentaje de grasa (${bfPercent.toFixed(1)}%) se encuentra en la ventana óptima de partición nutricional (${sex === 'male' ? '10% - 15%' : '20% - 25%'}). Estás habilitado para un Volumen Limpio (+12% sobre TDEE).`;
  } else {
    recommendedPhase = 'maintenance';
    primaryReason = `Mantenimiento Dinámico recomendado para estabilizar biomarcadores y calibrar el motor de TDEE en bucle cerrado.`;
  }

  const cutCalc = calculateTargetCaloriesForPhase({
    activeTdee: initialStaticTdee,
    phase: 'cut',
    fatMassKg,
  });
  const recompCalc = calculateTargetCaloriesForPhase({
    activeTdee: initialStaticTdee,
    phase: 'recomp',
    fatMassKg,
  });
  const bulkCalc = calculateTargetCaloriesForPhase({
    activeTdee: initialStaticTdee,
    phase: 'bulk',
    fatMassKg,
  });
  const maintCalc = calculateTargetCaloriesForPhase({
    activeTdee: initialStaticTdee,
    phase: 'maintenance',
    fatMassKg,
  });

  const options: Record<NutritionalPhase, PhaseOptionDetail> = {
    cut: {
      phase: 'cut',
      title: 'Déficit Calórico (Cut)',
      subtitle: 'Pérdida de grasa preservando masa contráctil',
      recommended: recommendedPhase === 'cut',
      priorityAlert: isPriorityCut,
      enabled: !(
        (sex === 'male' && bfPercent < 8) ||
        (sex === 'female' && bfPercent < 16)
      ),
      disabledReason:
        (sex === 'male' && bfPercent < 8) || (sex === 'female' && bfPercent < 16)
          ? 'Porcentaje graso cercano al límite esencial; no se recomienda déficit adicional.'
          : undefined,
      defaultAdjustmentPercent: cutCalc.appliedAdjustmentPercent,
      minAdjustmentPercent: -0.25,
      maxAdjustmentPercent: -0.15,
      targetKcal: cutCalc.targetKcal,
      effectiveDeficitOrSurplusKcal: cutCalc.deltaKcal,
      cappedByLipolysis: cutCalc.cappedByLipolysis,
      rationale: cutCalc.cappedByLipolysis
        ? `Ajuste limitado automáticamente a ${Math.abs(cutCalc.deltaKcal)} kcal/día por el tope fisiológico de lipólisis (68 kcal × ${fatMassKg.toFixed(1)} kg de grasa) para evitar catabolismo muscular.`
        : `Déficit del 20% (${Math.abs(cutCalc.deltaKcal)} kcal/día), dentro del límite seguro de lipólisis máxima (${cutCalc.maxLipolysisDeficitKcal} kcal/día).`,
    },
    recomp: {
      phase: 'recomp',
      title: 'Recomposición Corporal',
      subtitle: 'Hipertrofia simultánea con oxidación adiposa gradual',
      recommended: recommendedPhase === 'recomp',
      priorityAlert: false,
      enabled: true,
      defaultAdjustmentPercent: recompCalc.appliedAdjustmentPercent,
      minAdjustmentPercent: -0.15,
      maxAdjustmentPercent: -0.10,
      targetKcal: recompCalc.targetKcal,
      effectiveDeficitOrSurplusKcal: recompCalc.deltaKcal,
      cappedByLipolysis: recompCalc.cappedByLipolysis,
      rationale: `Déficit moderado del 12.5% (${Math.abs(recompCalc.deltaKcal)} kcal/día) sostenido por alta disponibilidad proteica (2.2 g/kg) y reservas endógenas.`,
    },
    bulk: {
      phase: 'bulk',
      title: 'Volumen Limpio (Lean Bulk)',
      subtitle: 'Superávit controlado para maximizar síntesis miofibrilar',
      recommended: recommendedPhase === 'bulk',
      priorityAlert: false,
      enabled: isLeanBulkEligible,
      disabledReason: !isLeanBulkEligible
        ? isWhtrAlert
          ? `Bloqueado por WHtR > 0.50 (${whtr?.toFixed(2)}). Prioriza reducir perímetro de cintura antes de iniciar superávit.`
          : `Habilitado únicamente con BF% entre ${sex === 'male' ? '10% y 15%' : '20% y 25%'} (actual: ${bfPercent.toFixed(1)}%). Iniciar volumen ahora deterioraría el ratio P (partición calórica hacia tejido adiposo).`
        : undefined,
      defaultAdjustmentPercent: bulkCalc.appliedAdjustmentPercent,
      minAdjustmentPercent: 0.10,
      maxAdjustmentPercent: 0.15,
      targetKcal: bulkCalc.targetKcal,
      effectiveDeficitOrSurplusKcal: bulkCalc.deltaKcal,
      cappedByLipolysis: false,
      rationale: `Superávit limpio del +12% (+${bulkCalc.deltaKcal} kcal/día) para hipertrofia magra minimizando ganancia grasa.`,
    },
    maintenance: {
      phase: 'maintenance',
      title: 'Mantenimiento Dinámico',
      subtitle: 'Equilibrio isoenergético, transición o descanso dietético',
      recommended: recommendedPhase === 'maintenance',
      priorityAlert: false,
      enabled: true,
      defaultAdjustmentPercent: 0,
      minAdjustmentPercent: 0,
      maxAdjustmentPercent: 0,
      targetKcal: maintCalc.targetKcal,
      effectiveDeficitOrSurplusKcal: 0,
      cappedByLipolysis: false,
      rationale: `Ingesta isoenergética (100% TDEE = ${maintCalc.targetKcal} kcal) ideal para estabilización hormonal, descanso dietético (>12 sem) o consolidación.`,
    },
  };

  return {
    recommendedPhase,
    primaryReason,
    whtrPriorityTriggered: isWhtrAlert,
    options,
  };
}

// ============================================================================
// 3. DISTRIBUCIÓN JERÁRQUICA DE MACRONUTRIENTES (NO PORCENTAJES FIJOS)
// ============================================================================

export interface HierarchicalMacrosResult extends MacroBreakdown {
  waterMl: number;
  proteinBasisUsed: 'total_weight' | 'lbm_adjusted';
  proteinGramsPerKgBasis: number;
  fatFloorApplied: boolean;
}

/**
 * Calcula los gramos diarios siguiendo estrictamente el orden jerárquico:
 * 1. Proteínas (4 kcal/g):
 *    - En Déficit o Recomposición: 2.2 g * kg (usa LBM si el BF% es muy elevado: Hombres > 25%, Mujeres > 32%).
 *    - En Mantenimiento o Volumen: 1.8 a 2.0 g * kg (por defecto 1.9 g/kg).
 * 2. Grasas (9 kcal/g):
 *    - Asignar el 25% de las calorías totales objetivo: (Kcal_Objetivo * 0.25) / 9
 *    - Garantizando un piso mínimo hormonal de 0.8 g/kg de peso corporal.
 * 3. Carbohidratos (4 kcal/g):
 *    - Asignar todo el remanente calórico: (Kcal_Objetivo - (Kcal_Proteina + Kcal_Grasa)) / 4
 * 4. Fibra e Hidratación:
 *    - Meta de fibra: 14g por cada 1,000 kcal.
 *    - Hidratación base: 35 ml * kg de peso.
 */
export function calculateHierarchicalMacros(params: {
  targetKcal: number;
  weightKg: number;
  lbmKg: number;
  bfPercent: number;
  sex: BiologicalSex;
  phase: NutritionalPhase;
  customProteinPerKg?: number;
}): HierarchicalMacrosResult {
  const { targetKcal, weightKg, lbmKg, bfPercent, sex, phase, customProteinPerKg } = params;

  // Determinar si el BF% es muy elevado para usar LBM como base proteica y evitar sobreestimación
  const isHighAdiposity =
    (sex === 'male' && bfPercent > 25) || (sex === 'female' && bfPercent > 32);
  const referenceMassKg = isHighAdiposity && lbmKg > 0 ? lbmKg : weightKg;
  const proteinBasisUsed = isHighAdiposity && lbmKg > 0 ? 'lbm_adjusted' : 'total_weight';

  // 1. Proteínas (4 kcal/g)
  let proteinMultiplier: number;
  if (phase === 'cut' || phase === 'recomp') {
    proteinMultiplier = customProteinPerKg ?? 2.2;
  } else {
    // Mantenimiento o Volumen: 1.8 a 2.0 g/kg (default 1.9 g/kg)
    proteinMultiplier = customProteinPerKg
      ? Math.max(1.8, Math.min(2.0, customProteinPerKg))
      : 1.9;
  }

  const proteinG = Math.round(referenceMassKg * proteinMultiplier);
  const proteinKcal = proteinG * KCAL_PER_GRAM_PROTEIN;

  // 2. Grasas (9 kcal/g): 25% de calorías objetivo con piso mínimo hormonal de 0.8 g/kg
  const fatFrom25PercentG = (targetKcal * 0.25) / KCAL_PER_GRAM_FAT;
  const hormonalFloorFatG = 0.8 * weightKg;
  const fatFloorApplied = hormonalFloorFatG > fatFrom25PercentG;
  const fatG = Math.round(Math.max(fatFrom25PercentG, hormonalFloorFatG));
  const fatKcal = fatG * KCAL_PER_GRAM_FAT;

  // 3. Carbohidratos (4 kcal/g): Todo el remanente calórico
  const remainingKcalForCarbs = Math.max(0, targetKcal - (proteinKcal + fatKcal));
  const carbsG = Math.round(remainingKcalForCarbs / KCAL_PER_GRAM_CARBS);

  // Calorías efectivas cuadradas con los macros redondeados
  const effectiveKcal = Math.round(
    proteinG * KCAL_PER_GRAM_PROTEIN +
      carbsG * KCAL_PER_GRAM_CARBS +
      fatG * KCAL_PER_GRAM_FAT
  );

  // 4. Fibra (14g / 1,000 kcal) e Hidratación (35 ml * kg)
  const fiberG = Math.round((targetKcal / 1000) * 14);
  const waterMl = Math.round(35 * weightKg);

  return {
    kcal: effectiveKcal,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    waterMl,
    proteinBasisUsed,
    proteinGramsPerKgBasis: proteinMultiplier,
    fatFloorApplied,
  };
}

// ============================================================================
// 4. SUAVIZADO DE PESO CORPORAL (EWMA) Y MOTOR DE TDEE ADAPTATIVO (BUCLE CERRADO)
// ============================================================================

/**
 * Calcula un paso diario de la Media Móvil Ponderada Exponencialmente (EWMA):
 * Peso_Tendencia_Hoy = (Peso_Bascula_Hoy * alpha) + (Peso_Tendencia_Ayer * (1 - alpha))
 * Ventana de suavizado alpha entre 0.10 y 0.15 (por defecto 0.12).
 */
export function calculateEwmaStep(
  scaleWeightToday: number,
  trendWeightYesterday: number | undefined | null,
  alpha = 0.12
): number {
  const safeAlpha = Math.max(0.1, Math.min(0.15, alpha));
  if (trendWeightYesterday === undefined || trendWeightYesterday === null || trendWeightYesterday <= 0) {
    return Number(scaleWeightToday.toFixed(2));
  }
  const trendToday = scaleWeightToday * safeAlpha + trendWeightYesterday * (1 - safeAlpha);
  return Number(trendToday.toFixed(2));
}

/**
 * Recalcula toda una serie histórica de BiometricLog en orden cronológico aplicando EWMA.
 */
export function recalculateBiometricTrends(logs: BiometricLog[], alpha = 0.12): BiometricLog[] {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  let previousTrend: number | undefined;

  return sorted.map((log) => {
    const trendWeightKg = calculateEwmaStep(log.scaleWeightKg, previousTrend, alpha);
    previousTrend = trendWeightKg;
    return {
      ...log,
      trendWeightKg,
    };
  });
}

export interface DailyNutritionSummary {
  date: string; // YYYY-MM-DD
  kcal: number | null; // null o 0 si el día quedó vacío (se imputará promedio habitual)
}

export interface AdaptiveTdeeResult {
  isReadyForAdaptive: boolean;
  readinessMessage: string;
  windowDays: number;
  loggedDaysCount: number;
  imputedDaysCount: number;
  avgDailyIntakeKcal: number;
  weightChangeKgPerDay: number;
  weightSlopeKgPerWeek: number;
  calculatedRealTdee: number;
  previousTdee: number;
  appliedTdee: number; // Amortiguado con máximo ±5% semanal
  wasDamped: boolean;
  dampingDirection?: 'up' | 'down' | 'none';
}

/**
 * Algoritmo de TDEE Adaptativo en Bucle Cerrado (Ventana móvil de 21 días):
 * - Requiere encontrarse al menos en el día 14-21 y contar con mínimo 4 días de registro nutricional
 *   completo por semana (mínimo 8 días en 14 días o 12 días en 21 días).
 * - Imputación Inteligente: Si un día queda vacío (descanso o vacaciones), asume la ingesta promedio
 *   habitual de los días registrados para no distorsionar el cálculo del TDEE.
 * - Ecuación de Balance de Energía:
 *   TDEE_Real = Promedio_Ingesta_Diaria_Kcal - (Cambio_Peso_Tendencia_Kg_Por_Dia * 7700)
 * - Amortiguador Semanal:
 *   Limita el cambio de TDEE vigente a un máximo de ±5% por check-in semanal.
 */
export function calculateAdaptiveTdee(params: {
  dailyIntakes: DailyNutritionSummary[];
  biometricLogs: BiometricLog[];
  previousTdee: number;
  windowDays?: number;
}): AdaptiveTdeeResult {
  const { dailyIntakes, biometricLogs, previousTdee, windowDays = 21 } = params;

  const sortedWeights = [...biometricLogs].sort((a, b) => a.date.localeCompare(b.date));
  const recentWeights = sortedWeights.slice(-windowDays);

  const sortedIntakes = [...dailyIntakes].sort((a, b) => a.date.localeCompare(b.date));
  const recentIntakes = sortedIntakes.slice(-windowDays);

  const validLoggedIntakes = recentIntakes.filter(
    (d): d is { date: string; kcal: number } => d.kcal !== null && d.kcal > 400
  );

  const loggedDaysCount = validLoggedIntakes.length;
  const totalSpanDays = Math.max(recentWeights.length, recentIntakes.length);
  const imputedDaysCount = Math.max(0, windowDays - loggedDaysCount);

  // Calcular promedio habitual en días registrados (Imputación Inteligente)
  const habitualAvgKcal =
    loggedDaysCount > 0
      ? Math.round(
          validLoggedIntakes.reduce((sum, item) => sum + item.kcal, 0) / loggedDaysCount
        )
      : previousTdee;

  // Como cada día vacío se imputa con habitualAvgKcal, el promedio diario de la ventana de 21 días
  // con imputación inteligente es exactamente igual a habitualAvgKcal.
  const avgDailyIntakeKcal = habitualAvgKcal;

  // Verificar requisitos de activación (mínimo 14 días de ventana y >= 4 días/semana -> >= 8 días en 2 sem o >= 12 en 3 sem)
  const minRequiredLoggedDays = totalSpanDays >= 21 ? 12 : 8;
  const hasEnoughWeights = recentWeights.length >= 2;
  let daySpanBetweenWeights = 0;

  if (hasEnoughWeights) {
    const firstDate = new Date(recentWeights[0].date).getTime();
    const lastDate = new Date(recentWeights[recentWeights.length - 1].date).getTime();
    daySpanBetweenWeights = Math.max(1, Math.round((lastDate - firstDate) / (1000 * 60 * 60 * 24)));
  }

  const isReadyForAdaptive =
    daySpanBetweenWeights >= 13 && loggedDaysCount >= minRequiredLoggedDays && hasEnoughWeights;

  if (!isReadyForAdaptive) {
    return {
      isReadyForAdaptive: false,
      readinessMessage: `Calibrando motor adaptativo: ${daySpanBetweenWeights}/14+ días de biometría y ${loggedDaysCount}/${minRequiredLoggedDays} días nutricionales válidos (mín. 4 días/semana). Se mantiene el TDEE vigente (${previousTdee} kcal).`,
      windowDays,
      loggedDaysCount,
      imputedDaysCount,
      avgDailyIntakeKcal,
      weightChangeKgPerDay: 0,
      weightSlopeKgPerWeek: 0,
      calculatedRealTdee: previousTdee,
      previousTdee,
      appliedTdee: previousTdee,
      wasDamped: false,
      dampingDirection: 'none',
    };
  }

  // Calcular Cambio_Peso_Tendencia_Kg_Por_Dia sobre la ventana de peso en tendencia (EWMA)
  const startTrendKg = recentWeights[0].trendWeightKg;
  const endTrendKg = recentWeights[recentWeights.length - 1].trendWeightKg;
  const weightChangeKgPerDay = (endTrendKg - startTrendKg) / daySpanBetweenWeights;
  const weightSlopeKgPerWeek = Number((weightChangeKgPerDay * 7).toFixed(3));

  // Ecuación exacta: TDEE_Real = Promedio_Ingesta_Diaria_Kcal - (Cambio_Peso_Tendencia_Kg_Por_Dia * 7700)
  const rawRealTdee =
    avgDailyIntakeKcal - weightChangeKgPerDay * KCAL_PER_KG_ADIPOSE_TISSUE;
  const calculatedRealTdee = Math.round(Math.max(900, Math.min(6500, rawRealTdee)));

  // Amortiguador máximo del ±5% semanal sobre previousTdee
  const minAllowedTdee = Math.round(previousTdee * (1 - WEEKLY_TDEE_DAMPING_MAX_PCT));
  const maxAllowedTdee = Math.round(previousTdee * (1 + WEEKLY_TDEE_DAMPING_MAX_PCT));

  const appliedTdee = Math.max(minAllowedTdee, Math.min(maxAllowedTdee, calculatedRealTdee));
  const wasDamped = appliedTdee !== calculatedRealTdee;
  const dampingDirection =
    appliedTdee > calculatedRealTdee
      ? 'down'
      : appliedTdee < calculatedRealTdee
        ? 'up'
        : 'none';

  return {
    isReadyForAdaptive: true,
    readinessMessage: `Motor en Bucle Cerrado activo (${daySpanBetweenWeights} días de tendencia EWMA, ${loggedDaysCount} días registrados y ${imputedDaysCount} días imputados).`,
    windowDays,
    loggedDaysCount,
    imputedDaysCount,
    avgDailyIntakeKcal,
    weightChangeKgPerDay: Number(weightChangeKgPerDay.toFixed(5)),
    weightSlopeKgPerWeek,
    calculatedRealTdee,
    previousTdee,
    appliedTdee,
    wasDamped,
    dampingDirection,
  };
}

// ============================================================================
// 5. ASISTENTE DE CIERRE DE MACROS ("ALIMENTOS PUENTE") Y RECETAS ESCALABLES
// ============================================================================

export interface RemainingMacrosVector {
  kcal: number;
  P: number;
  C: number;
  G: number;
  fiberG: number;
}

/**
 * Calcula en tiempo real el vector de nutrientes restantes del día:
 * Restante = { kcal: Meta - Consumido, P: Meta_P - Consumido_P, C: Meta_C - Consumido_C, G: Meta_G - Consumido_G }
 */
export function calculateRemainingMacros(
  target: MacroBreakdown,
  consumed: MacroBreakdown
): RemainingMacrosVector {
  return {
    kcal: Math.round(target.kcal - consumed.kcal),
    P: Math.round(target.proteinG - consumed.proteinG),
    C: Math.round(target.carbsG - consumed.carbsG),
    G: Math.round(target.fatG - consumed.fatG),
    fiberG: Math.round(target.fiberG - consumed.fiberG),
  };
}

/**
 * Calcula los macronutrientes exactos para una cantidad en gramos de un FoodItem.
 */
export function calculateFoodItemMacros(food: FoodItem, grams: number): MacroBreakdown {
  const ratio = Math.max(0, grams) / 100;
  return {
    kcal: Math.round(food.kcalPer100g * ratio),
    proteinG: Number((food.proteinPer100g * ratio).toFixed(1)),
    carbsG: Number((food.carbsPer100g * ratio).toFixed(1)),
    fatG: Number((food.fatPer100g * ratio).toFixed(1)),
    fiberG: Number((food.fiberPer100g * ratio).toFixed(1)),
  };
}

export interface BridgeFoodSuggestion {
  id: string;
  title: string;
  reason: string;
  items: Array<{
    food: FoodItem;
    grams: number;
    macros: MacroBreakdown;
  }>;
  totalMacros: MacroBreakdown;
  matchScore: number; // 0 a 100
}

/**
 * Motor de Cierre de Macros ("Alimentos Puente"):
 * Analiza el vector Restante y sugiere combinaciones exactas en gramos de alimentos simples
 * de la base de datos o favoritos para cuadrar el día.
 */
export function suggestBridgeFoods(
  remaining: RemainingMacrosVector,
  foods: FoodItem[]
): BridgeFoodSuggestion[] {
  if (remaining.kcal <= 40 && remaining.P <= 5 && remaining.C <= 5 && remaining.G <= 3) {
    return [];
  }

  const candidateFoods = foods.filter((f) => f.isBridgeFood || f.isFavorite);
  const pool = candidateFoods.length > 0 ? candidateFoods : foods;

  // Clasificar alimentos por macronutriente dominante
  const leanProteins = pool.filter(
    (f) => f.proteinPer100g >= 10 && f.proteinPer100g * 4 >= f.kcalPer100g * 0.55
  );
  const pureCarbs = pool.filter(
    (f) => f.carbsPer100g >= 12 && f.carbsPer100g * 4 >= f.kcalPer100g * 0.6
  );
  const healthyFats = pool.filter(
    (f) => f.fatPer100g >= 12 && f.fatPer100g * 9 >= f.kcalPer100g * 0.55
  );

  const suggestions: BridgeFoodSuggestion[] = [];

  // Caso 1: Falta principalmente Proteína (ej. 35g P y ~180 kcal)
  if (remaining.P >= 12) {
    for (const pFood of leanProteins.slice(0, 4)) {
      const rawGrams = (remaining.P / pFood.proteinPer100g) * 100;
      const grams = Math.max(30, Math.min(450, Math.round(rawGrams / 5) * 5));
      const macros = calculateFoodItemMacros(pFood, grams);

      // Si también faltan carbohidratos significativos (>20g) y calorías disponibles, combinar con un carbohidrato puente
      const remCarbsAfterP = remaining.C - macros.carbsG;
      const remKcalAfterP = remaining.kcal - macros.kcal;

      if (remCarbsAfterP >= 18 && remKcalAfterP >= 80 && pureCarbs.length > 0) {
        const cFood = pureCarbs[0];
        const cGrams = Math.max(
          25,
          Math.min(350, Math.round(((remCarbsAfterP / cFood.carbsPer100g) * 100) / 5) * 5)
        );
        const cMacros = calculateFoodItemMacros(cFood, cGrams);
        const combined: MacroBreakdown = {
          kcal: macros.kcal + cMacros.kcal,
          proteinG: Number((macros.proteinG + cMacros.proteinG).toFixed(1)),
          carbsG: Number((macros.carbsG + cMacros.carbsG).toFixed(1)),
          fatG: Number((macros.fatG + cMacros.fatG).toFixed(1)),
          fiberG: Number((macros.fiberG + cMacros.fiberG).toFixed(1)),
        };

        suggestions.push({
          id: `bridge-combo-${pFood.id}-${cFood.id}`,
          title: `${grams}g ${pFood.name} + ${cGrams}g ${cFood.name}`,
          reason: `Cierra simultáneamente tu brecha de proteína (${combined.proteinG}g) y carbohidratos (${combined.carbsG}g).`,
          items: [
            { food: pFood, grams, macros },
            { food: cFood, grams: cGrams, macros: cMacros },
          ],
          totalMacros: combined,
          matchScore: 95,
        });
      }

      suggestions.push({
        id: `bridge-prot-${pFood.id}`,
        title: `${grams}g de ${pFood.name}`,
        reason: `Aporta ${macros.proteinG}g de proteína limpia en solo ${macros.kcal} kcal para cuadrar tu meta proteica.`,
        items: [{ food: pFood, grams, macros }],
        totalMacros: macros,
        matchScore: 90,
      });
    }
  }

  // Caso 2: Faltan Carbohidratos energéticos
  if (remaining.C >= 20) {
    for (const cFood of pureCarbs.slice(0, 2)) {
      const rawGrams = (remaining.C / cFood.carbsPer100g) * 100;
      const grams = Math.max(25, Math.min(350, Math.round(rawGrams / 5) * 5));
      const macros = calculateFoodItemMacros(cFood, grams);

      suggestions.push({
        id: `bridge-carb-${cFood.id}`,
        title: `${grams}g de ${cFood.name}`,
        reason: `Recarga glucógeno con ${macros.carbsG}g de carbohidratos y mínimo impacto en grasas (${macros.fatG}g).`,
        items: [{ food: cFood, grams, macros }],
        totalMacros: macros,
        matchScore: 84,
      });
    }
  }

  // Caso 3: Faltan Grasas esenciales
  if (remaining.G >= 8) {
    for (const fFood of healthyFats.slice(0, 2)) {
      const rawGrams = (remaining.G / fFood.fatPer100g) * 100;
      const grams = Math.max(10, Math.min(120, Math.round(rawGrams / 5) * 5));
      const macros = calculateFoodItemMacros(fFood, grams);

      suggestions.push({
        id: `bridge-fat-${fFood.id}`,
        title: `${grams}g de ${fFood.name}`,
        reason: `Cubre el piso lipídico hormonal con ${macros.fatG}g de grasas saludables (${macros.kcal} kcal).`,
        items: [{ food: fFood, grams, macros }],
        totalMacros: macros,
        matchScore: 82,
      });
    }
  }

  // Deduplicar y ordenar por cercanía al vector restante
  const unique = new Map<string, BridgeFoodSuggestion>();
  for (const s of suggestions) {
    if (!unique.has(s.id)) {
      unique.set(s.id, s);
    }
  }

  return Array.from(unique.values()).slice(0, 5);
}

export interface ScaledRecipeResult {
  recipe: Recipe;
  scaleFactor: number;
  scaledIngredients: Array<{
    foodId: string;
    foodName: string;
    originalGrams: number;
    scaledGrams: number;
    macros: MacroBreakdown;
  }>;
  scaledTotalMacros: MacroBreakdown & { totalGrams: number };
}

/**
 * Escala dinámicamente los ingredientes en gramos de una receta para encajar
 * en el vector Restante (o en una fracción objetivo de las calorías/proteínas restantes).
 */
export function scaleRecipeToRemaining(
  recipe: Recipe,
  remaining: RemainingMacrosVector,
  foodsMap: Record<string, FoodItem>
): ScaledRecipeResult {
  const baseKcal = Math.max(1, recipe.totalMacros.kcal);
  const targetKcalToFill = Math.max(200, Math.min(1200, remaining.kcal > 0 ? remaining.kcal : baseKcal));

  const rawScale = targetKcalToFill / baseKcal;
  const scaleFactor = Number(Math.max(0.35, Math.min(2.5, rawScale)).toFixed(2));

  let totalKcal = 0;
  let totalP = 0;
  let totalC = 0;
  let totalG = 0;
  let totalFiber = 0;
  let totalGrams = 0;

  const scaledIngredients = recipe.ingredients.map((ing) => {
    const food = foodsMap[ing.foodId];
    const scaledGrams = Math.max(5, Math.round((ing.grams * scaleFactor) / 5) * 5);
    const macros = food
      ? calculateFoodItemMacros(food, scaledGrams)
      : {
          kcal: Math.round((recipe.totalMacros.kcal / recipe.totalMacros.totalGrams) * scaledGrams),
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          fiberG: 0,
        };

    totalKcal += macros.kcal;
    totalP += macros.proteinG;
    totalC += macros.carbsG;
    totalG += macros.fatG;
    totalFiber += macros.fiberG;
    totalGrams += scaledGrams;

    return {
      foodId: ing.foodId,
      foodName: food ? food.name : ing.foodId,
      originalGrams: ing.grams,
      scaledGrams,
      macros,
    };
  });

  return {
    recipe,
    scaleFactor,
    scaledIngredients,
    scaledTotalMacros: {
      kcal: Math.round(totalKcal),
      proteinG: Number(totalP.toFixed(1)),
      carbsG: Number(totalC.toFixed(1)),
      fatG: Number(totalG.toFixed(1)),
      fiberG: Number(totalFiber.toFixed(1)),
      totalGrams,
    },
  };
}
