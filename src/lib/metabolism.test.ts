import { describe, expect, it } from 'vitest';
import {
  calculateAdaptiveTdee,
  calculateBmr,
  calculateBoerLbm,
  calculateEwmaStep,
  calculateHierarchicalMacros,
  calculateLbmFromBodyFat,
  calculateTargetCaloriesForPhase,
  calculateUsNavyBodyFat,
  calculateWhtr,
  evaluateAnthropometrics,
  recommendNutritionalPhase,
} from './metabolism';

describe('Motor Metabólico & Antropométrico (src/lib/metabolism.ts)', () => {
  it('calcula % de Grasa Corporal con US Navy exactamente para Hombres y Mujeres', () => {
    // Hombre: altura 178 cm, cintura 84 cm, cuello 39 cm
    const maleBf = calculateUsNavyBodyFat({
      sex: 'male',
      heightCm: 178,
      waistCm: 84,
      neckCm: 39,
    });
    // 495 / (1.0324 - 0.19077 * log10(45) + 0.15456 * log10(178)) - 450 = 14.86%
    expect(maleBf).toBeCloseTo(14.86, 2);

    // Mujer: altura 165 cm, cintura 72 cm, cadera 98 cm, cuello 33 cm
    const femaleBf = calculateUsNavyBodyFat({
      sex: 'female',
      heightCm: 165,
      waistCm: 72,
      hipCm: 98,
      neckCm: 33,
    });
    // 495 / (1.29579 - 0.35004 * log10(137) + 0.22100 * log10(165)) - 450 = 26.92%
    expect(femaleBf).toBeCloseTo(26.92, 2);
  });

  it('usa la fórmula de Boer (1984) como fallback cuando no se ingresan medidas perimetrales', () => {
    // Hombre: 80 kg, 180 cm -> (0.407 * 80) + (0.267 * 180) - 19.2 = 32.56 + 48.06 - 19.2 = 61.42 kg
    const maleLbm = calculateBoerLbm({ sex: 'male', weightKg: 80, heightCm: 180 });
    expect(maleLbm).toBeCloseTo(61.42, 2);

    // Mujer: 65 kg, 165 cm -> (0.252 * 65) + (0.473 * 165) - 48.3 = 16.38 + 78.045 - 48.3 = 46.13 kg
    const femaleLbm = calculateBoerLbm({ sex: 'female', weightKg: 65, heightCm: 165 });
    expect(femaleLbm).toBeCloseTo(46.13, 2);

    const diag = evaluateAnthropometrics({
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      pal: 1.55,
      trainingExperience: 'intermediate',
    });
    expect(diag.bfMethod).toBe('boer_fallback');
    expect(diag.lbmKg).toBeCloseTo(61.42, 2);
    expect(diag.bmrFormula).toBe('mifflin_st_jeor');
  });

  it('calcula LBM y WHtR con alerta de prioridad si WHtR > 0.50', () => {
    expect(calculateLbmFromBodyFat(80, 15)).toBeCloseTo(68, 2);
    expect(calculateWhtr(92, 178)).toBeCloseTo(0.517, 3);

    const diag = evaluateAnthropometrics({
      sex: 'male',
      age: 32,
      heightCm: 178,
      weightKg: 88,
      pal: 1.45,
      trainingExperience: 'intermediate',
      neckCm: 39,
      waistCm: 93,
    });
    expect(diag.isWhtrAlert).toBe(true);
  });

  it('conmuta correctamente entre Katch-McArdle y Mifflin-St Jeor según BF% verificado', () => {
    // Hombre con BF% <= 20% verificado por medidas -> Katch-McArdle: 370 + 21.6 * LBM
    const katch = calculateBmr({
      sex: 'male',
      weightKg: 78,
      heightCm: 178,
      age: 27,
      bfPercent: 14.5,
      lbmKg: 66.69,
      verifiedByTape: true,
    });
    expect(katch.formula).toBe('katch_mcardle');
    expect(katch.bmrKcal).toBe(Math.round(370 + 21.6 * 66.69));

    // Hombre con BF% > 20% -> Mifflin-St Jeor
    const mifflin = calculateBmr({
      sex: 'male',
      weightKg: 95,
      heightCm: 178,
      age: 27,
      bfPercent: 24.5,
      lbmKg: 71.7,
      verifiedByTape: true,
    });
    expect(mifflin.formula).toBe('mifflin_st_jeor');
    expect(mifflin.bmrKcal).toBe(Math.round(10 * 95 + 6.25 * 178 - 5 * 27 + 5));
  });

  it('aplica el árbol de decisión de fases y respeta el límite de lipólisis máxima (68 kcal/kg grasa)', () => {
    // Caso 1: Hombre con 13% BF -> Habilita y recomienda Lean Bulk (+12%)
    const leanBulkRec = recommendNutritionalPhase({
      sex: 'male',
      age: 25,
      heightCm: 180,
      weightKg: 76,
      pal: 1.6,
      trainingExperience: 'intermediate',
      neckCm: 40,
      waistCm: 79,
    });
    expect(leanBulkRec.recommendedPhase).toBe('bulk');
    expect(leanBulkRec.options.bulk.enabled).toBe(true);

    // Caso 2: Novato con 18.5% BF -> Recomienda Recomposición Corporal (-12.5%) y bloquea Lean Bulk
    const recompRec = recommendNutritionalPhase({
      sex: 'male',
      age: 26,
      heightCm: 178,
      weightKg: 80,
      pal: 1.5,
      trainingExperience: 'novice',
      neckCm: 38,
      waistCm: 86,
    });
    expect(recompRec.recommendedPhase).toBe('recomp');
    expect(recompRec.options.bulk.enabled).toBe(false);

    // Verificar tope de lipólisis: si TDEE = 3200 y fatMassKg = 8 kg -> maxLipolysis = 8 * 68 = 544 kcal (< 20% de 3200 = 640 kcal)
    const cappedCut = calculateTargetCaloriesForPhase({
      activeTdee: 3200,
      phase: 'cut',
      fatMassKg: 8,
    });
    expect(cappedCut.cappedByLipolysis).toBe(true);
    expect(cappedCut.deltaKcal).toBe(-544);
    expect(cappedCut.targetKcal).toBe(3200 - 544);
  });

  it('distribuye macronutrientes jerárquicamente con piso hormonal de grasas (0.8g/kg) y fibra 14g/1000kcal', () => {
    const macros = calculateHierarchicalMacros({
      targetKcal: 2200,
      weightKg: 80,
      lbmKg: 66,
      bfPercent: 17.5,
      sex: 'male',
      phase: 'cut',
    });
    // Proteína en déficit: 2.2 * 80 = 176g (704 kcal)
    expect(macros.proteinG).toBe(176);
    // Grasa: max((2200 * 0.25)/9 = 61.1g, 0.8 * 80 = 64g) -> aplica piso hormonal 64g (576 kcal)
    expect(macros.fatG).toBe(64);
    expect(macros.fatFloorApplied).toBe(true);
    // Carbohidratos: (2200 - (704 + 576)) / 4 = 920 / 4 = 230g
    expect(macros.carbsG).toBe(230);
    // Fibra: round(2.2 * 14) = 31g, Agua: 35 * 80 = 2800 ml
    expect(macros.fiberG).toBe(31);
    expect(macros.waterMl).toBe(2800);
  });

  it('calcula EWMA y TDEE Adaptativo en bucle cerrado con imputación inteligente y amortiguador ±5%', () => {
    // EWMA: hoy 80.0 kg, ayer 81.0 kg, alpha 0.10 -> 80*0.1 + 81*0.9 = 80.9 kg
    expect(calculateEwmaStep(80.0, 81.0, 0.1)).toBeCloseTo(80.9, 2);

    // Simular ventana de 21 días donde el usuario consume 2400 kcal promedio (con 3 días vacíos que se imputan)
    // y pierde 0.05 kg/día de peso en tendencia (-0.35 kg/semana) -> TDEE Real = 2400 - (-0.05 * 7700) = 2785 kcal
    const dailyIntakes = Array.from({ length: 21 }, (_, idx) => ({
      date: `2026-10-${String(idx + 1).padStart(2, '0')}`,
      kcal: idx % 7 === 0 ? null : 2400, // 3 días vacíos imputados a 2400 kcal
    }));

    const biometricLogs = Array.from({ length: 21 }, (_, idx) => ({
      id: `log-${idx}`,
      date: `2026-10-${String(idx + 1).padStart(2, '0')}`,
      scaleWeightKg: Number((82 - idx * 0.05).toFixed(2)),
      trendWeightKg: Number((82 - idx * 0.05).toFixed(2)),
      estimatedBfPercent: 16,
      bfMethod: 'us_navy' as const,
      lbmKg: 68.8,
      fatMassKg: 13.2,
    }));

    // Con previousTdee = 2500, TDEE Real es 2785, pero el amortiguador ±5% limita appliedTdee a 2500 * 1.05 = 2625 kcal
    const adaptive = calculateAdaptiveTdee({
      dailyIntakes,
      biometricLogs,
      previousTdee: 2500,
    });

    expect(adaptive.isReadyForAdaptive).toBe(true);
    expect(adaptive.avgDailyIntakeKcal).toBe(2400);
    expect(adaptive.calculatedRealTdee).toBe(2785);
    expect(adaptive.appliedTdee).toBe(2625);
    expect(adaptive.wasDamped).toBe(true);
  });
});
