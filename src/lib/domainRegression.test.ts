import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BiometricLog, WorkoutSession } from '../types/nutrition';
import { addDays, ageOn, daysBetween, isCivilDate, localDate, weekStart } from './dates';
import {
  calculateAdaptiveTdee,
  calculateHierarchicalMacros,
  calculateTargetCaloriesForPhase,
} from './metabolism';
import { getDoubleProgressionSuggestion } from './strengthAnalytics';
const weights: BiometricLog[] = Array.from({ length: 21 }, (_, i) => ({
  id: `b${i}`,
  date: addDays('2026-10-01', i),
  scaleWeightKg: 82 - i * 0.05,
  trendWeightKg: 82 - i * 0.05,
  estimatedBfPercent: 18,
  bfMethod: 'boer_fallback',
  lbmKg: 67,
  fatMassKg: 15,
}));
const intakes = weights.map((b) => ({ date: b.date, kcal: 2400, isComplete: true }));
const input = {
  biometricLogs: weights,
  dailyIntakes: intakes,
  previousTdee: 2500,
  referenceDate: '2026-10-21',
};
afterEach(() => vi.unstubAllEnvs());
describe('civil calendar boundaries', () => {
  it('uses the local evening date instead of tomorrow UTC', () => {
    const date = new Date('2026-11-13T01:30:00Z');
    vi.spyOn(date, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(date, 'getMonth').mockReturnValue(10);
    vi.spyOn(date, 'getDate').mockReturnValue(12);
    expect(localDate(date)).toBe('2026-11-12');
  });
  it('handles leap years and week/year boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });
  it('rejects impossible and future births without inventing age', () => {
    expect(isCivilDate('2026-02-30')).toBe(false);
    expect(() => ageOn('2030-01-01', '2026-11-12')).toThrow();
    expect(() => ageOn('invalid')).toThrow();
    expect(ageOn('2000-11-13', '2026-11-12')).toBe(25);
  });
});
describe('coherent energy budget', () => {
  it('reports an incompatible budget and returns coherent energy', () => {
    const m = calculateHierarchicalMacros({
      targetKcal: 1200,
      weightKg: 80,
      lbmKg: 66,
      bfPercent: 17.5,
      sex: 'male',
      phase: 'cut',
    });
    expect(m.kcal).toBe(1280);
    expect(m.kcal).toBe(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9);
    expect(m.energyAdjustmentReason).toContain('1200');
  });
  it('preserves invariants over a grid of inputs', () => {
    for (const targetKcal of [1000, 1500, 2200, 3500])
      for (const weightKg of [45, 80, 150]) {
        const m = calculateHierarchicalMacros({
          targetKcal,
          weightKg,
          lbmKg: weightKg * 0.8,
          bfPercent: 20,
          sex: 'male',
          phase: 'cut',
        });
        expect(m.kcal).toBe(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9);
        expect(m.carbsG).toBeGreaterThanOrEqual(0);
      }
  });
  it('rejects nonfinite values and reports the actual bounded delta', () => {
    expect(() =>
      calculateHierarchicalMacros({
        targetKcal: NaN,
        weightKg: 80,
        lbmKg: 60,
        bfPercent: 20,
        sex: 'male',
        phase: 'cut',
      }),
    ).toThrow();
    const p = calculateTargetCaloriesForPhase({ activeTdee: 1000, phase: 'cut', fatMassKg: 10 });
    expect(p.deltaKcal).toBe(p.targetKcal - 1000);
  });
});
describe('aligned adaptive windows', () => {
  it('uses the same observed interval and excludes future data', () => {
    expect(calculateAdaptiveTdee(input).calculatedRealTdee).toBe(2785);
    const future = {
      ...input,
      dailyIntakes: [...intakes, { date: '2026-10-22', kcal: 9999, isComplete: true }],
      biometricLogs: [...weights, { ...weights[0], date: '2026-10-22', trendWeightKg: 120 }],
    };
    expect(calculateAdaptiveTdee(future).calculatedRealTdee).toBe(2785);
  });
  it('does not treat a partial food log as complete', () => {
    const r = calculateAdaptiveTdee({
      ...input,
      dailyIntakes: intakes.map((d) => ({ ...d, isComplete: false })),
    });
    expect(r.isReadyForAdaptive).toBe(false);
    expect(r.appliedTdee).toBe(2500);
  });
  it('does not compare months of weights against three weeks of food', () => {
    expect(
      calculateAdaptiveTdee({
        ...input,
        biometricLogs: [{ ...weights[0], date: '2026-01-01' }, weights[20]],
      }).isReadyForAdaptive,
    ).toBe(false);
  });
  it('freezes adaptation for stale weigh-ins', () => {
    expect(
      calculateAdaptiveTdee({ ...input, referenceDate: '2026-11-12' }).isReadyForAdaptive,
    ).toBe(false);
  });
});
it('does not unlock progression from one of three prescribed sets', () => {
  const session: WorkoutSession = {
    id: 's',
    date: '2026-11-12',
    startTime: '12:00',
    endTime: '13:00',
    durationMinutes: 60,
    bodyweightKgAtSession: 80,
    totalVolumeKg: 800,
    sets: [
      {
        id: 'set',
        exerciseId: 'e',
        setNumber: 1,
        setType: 'working',
        weightKg: 80,
        reps: 10,
        isCompleted: true,
        isPrWeight: false,
        isPr1RM: false,
        estimated1RM: 100,
      },
    ],
  };
  const r = getDoubleProgressionSuggestion({
    routineExercise: {
      exerciseId: 'e',
      order: 1,
      targetSets: 3,
      targetRepRange: [6, 10],
      targetRir: 1,
      restSeconds: 120,
      progressionRule: 'double_progression',
    },
    previousSessions: [session],
  });
  expect(r.allWorkingSetsHitTopOfRange).toBe(false);
  expect(r.setSuggestions[0].suggestedWeightKg).toBe(80);
});
