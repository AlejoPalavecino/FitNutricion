import { describe, expect, it } from 'vitest';
import { OPENGYM_EXERCISE_CATALOG } from '../data/opengymCatalog';
import type { WorkoutSession } from '../types/nutrition';
import {
  calculateEstimated1RM,
  calculatePeriWorkoutNutrition,
  calculateSessionTonnageKg,
  calculateWeeklyMuscleVolume,
  evaluateStrengthBodyweightSynergy,
  getDoubleProgressionSuggestion,
} from './strengthAnalytics';

describe('Analítica de Fuerza & Sobrecarga Progresiva (src/lib/strengthAnalytics.ts)', () => {
  it('usa Fórmula de Brzycki para <= 10 reps, Epley para > 10 reps e ignora series warmup', () => {
    // Warmup -> 0
    expect(calculateEstimated1RM(100, 8, 'warmup')).toBe(0);

    // Brzycki (8 reps con 100 kg): 100 / (1.0278 - 0.0278 * 8) = 100 / 0.8054 = 124.2 kg
    expect(calculateEstimated1RM(100, 8, 'working')).toBeCloseTo(124.2, 1);

    // Epley (12 reps con 100 kg): 100 * (1 + 12 / 30) = 140.0 kg
    expect(calculateEstimated1RM(100, 12, 'working')).toBeCloseTo(140.0, 1);
  });

  it('calcula sugerencias de Doble Progresión: sube +2.5kg al completar el rango o sugiere +1 rep', () => {
    const benchCatalog = OPENGYM_EXERCISE_CATALOG.find((e) => e.id === 'og-0025');
    const prevSessionHitAll: WorkoutSession = {
      id: 'sess-1',
      date: '2026-10-18',
      startTime: '18:00',
      endTime: '19:00',
      durationMinutes: 60,
      bodyweightKgAtSession: 80,
      totalVolumeKg: 2400,
      sets: [
        {
          id: 's1',
          exerciseId: 'og-0025',
          setNumber: 1,
          setType: 'working',
          weightKg: 80,
          reps: 10,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: 106.7,
        },
        {
          id: 's2',
          exerciseId: 'og-0025',
          setNumber: 2,
          setType: 'working',
          weightKg: 80,
          reps: 10,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: 106.7,
        },
      ],
    };

    const planIncrement = getDoubleProgressionSuggestion({
      routineExercise: {
        exerciseId: 'og-0025',
        order: 1,
        targetSets: 2,
        targetRepRange: [6, 10],
        targetRir: 1,
        restSeconds: 150,
        progressionRule: 'double_progression',
      },
      catalogItem: benchCatalog,
      previousSessions: [prevSessionHitAll],
    });

    expect(planIncrement.allWorkingSetsHitTopOfRange).toBe(true);
    expect(planIncrement.setSuggestions[0].suggestedWeightKg).toBe(82.5);
    expect(planIncrement.setSuggestions[0].suggestedReps).toBe(6);

    // Si en la serie 2 hizo 8 reps (< 10), mantiene 80 kg y sugiere +1 rep (9)
    const prevSessionPartial: WorkoutSession = {
      ...prevSessionHitAll,
      sets: [prevSessionHitAll.sets[0], { ...prevSessionHitAll.sets[1], reps: 8 }],
    };

    const planKeep = getDoubleProgressionSuggestion({
      routineExercise: {
        exerciseId: 'og-0025',
        order: 1,
        targetSets: 2,
        targetRepRange: [6, 10],
        targetRir: 1,
        restSeconds: 150,
        progressionRule: 'double_progression',
      },
      catalogItem: benchCatalog,
      previousSessions: [prevSessionPartial],
    });

    expect(planKeep.allWorkingSetsHitTopOfRange).toBe(false);
    expect(planKeep.setSuggestions[1].suggestedWeightKg).toBe(80);
    expect(planKeep.setSuggestions[1].suggestedReps).toBe(9);
  });

  it('contabiliza volumen semanal (1.0 primario, 0.5 secundario) e ignora series warmup en tonelaje', () => {
    const sets = [
      {
        id: 'w1',
        exerciseId: 'og-0025',
        setNumber: 1,
        setType: 'warmup' as const,
        weightKg: 50,
        reps: 10,
        isCompleted: true,
        isPrWeight: false,
        isPr1RM: false,
        estimated1RM: 0,
      },
      {
        id: 'wk1',
        exerciseId: 'og-0025',
        setNumber: 2,
        setType: 'working' as const,
        weightKg: 80,
        reps: 8,
        isCompleted: true,
        isPrWeight: false,
        isPr1RM: false,
        estimated1RM: 99.3,
      },
      {
        id: 'wk2',
        exerciseId: 'og-0025',
        setNumber: 3,
        setType: 'failure' as const,
        weightKg: 80,
        reps: 8,
        isCompleted: true,
        isPrWeight: false,
        isPr1RM: false,
        estimated1RM: 99.3,
      },
    ];

    expect(calculateSessionTonnageKg(sets)).toBe(1280); // Solo las 2 series efectivas (80*8*2)

    const vol = calculateWeeklyMuscleVolume({
      sessions: [
        {
          id: 'sess-vol',
          date: '2026-10-22',
          startTime: '18:00',
          endTime: '19:00',
          durationMinutes: 60,
          bodyweightKgAtSession: 80,
          totalVolumeKg: 1280,
          sets,
        },
      ],
      catalog: OPENGYM_EXERCISE_CATALOG,
      referenceDateStr: '2026-10-23',
    });

    const chestVol = vol.find((v) => v.muscle === 'Pecho');
    const tricepsVol = vol.find((v) => v.muscle === 'Tríceps');
    expect(chestVol?.totalEffectiveSets).toBe(2.0);
    expect(tricepsVol?.totalEffectiveSets).toBe(1.0); // 2 * 0.5
  });

  it('detecta Retención Muscular / Recomposición Exitosa cuando el peso EWMA baja y el 1RM sube', () => {
    const report = evaluateStrengthBodyweightSynergy({
      exerciseId: 'og-0043',
      currentPhase: 'cut',
      biometricLogs: [
        {
          id: 'b1',
          date: '2026-10-05',
          scaleWeightKg: 82.0,
          trendWeightKg: 82.0,
          estimatedBfPercent: 18,
          bfMethod: 'us_navy',
          lbmKg: 67.2,
          fatMassKg: 14.8,
        },
        {
          id: 'b2',
          date: '2026-10-20',
          scaleWeightKg: 80.5,
          trendWeightKg: 80.8,
          estimatedBfPercent: 16.8,
          bfMethod: 'us_navy',
          lbmKg: 67.2,
          fatMassKg: 13.6,
        },
      ],
      workoutSessions: [
        {
          id: 'ws1',
          date: '2026-10-05',
          startTime: '18:00',
          endTime: '19:00',
          durationMinutes: 60,
          bodyweightKgAtSession: 82,
          totalVolumeKg: 2400,
          sets: [
            {
              id: 's1',
              exerciseId: 'og-0043',
              setNumber: 1,
              setType: 'working',
              weightKg: 110,
              reps: 6,
              isCompleted: true,
              isPrWeight: false,
              isPr1RM: false,
              estimated1RM: 127.8,
            },
          ],
        },
        {
          id: 'ws2',
          date: '2026-10-20',
          startTime: '18:00',
          endTime: '19:00',
          durationMinutes: 60,
          bodyweightKgAtSession: 80.5,
          totalVolumeKg: 2500,
          sets: [
            {
              id: 's2',
              exerciseId: 'og-0043',
              setNumber: 1,
              setType: 'working',
              weightKg: 115,
              reps: 6,
              isCompleted: true,
              isPrWeight: true,
              isPr1RM: true,
              estimated1RM: 133.6,
            },
          ],
        },
      ],
    });

    expect(report.isSuccessfulRecompOrRetention).toBe(true);
    expect(report.synergyBadgeTitle).toBe('Retención Muscular / Recomposición Exitosa');

    const peri = calculatePeriWorkoutNutrition({
      date: '2026-10-20',
      bodyweightKg: 80,
      dailyTargetCarbsG: 240,
      sessions: [
        {
          id: 'ws2',
          date: '2026-10-20',
          startTime: '18:00',
          endTime: '19:00',
          durationMinutes: 60,
          bodyweightKgAtSession: 80,
          totalVolumeKg: 2500,
          sets: [],
        },
      ],
    });
    expect(peri.hasWorkoutToday).toBe(true);
    expect(peri.minPostWorkoutProteinG).toBe(32); // 0.4 * 80 = 32g
  });
});
