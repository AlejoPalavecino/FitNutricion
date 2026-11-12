import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudSyncService } from '../services/cloudSyncService';
import type { WorkoutSetLog } from '../types/nutrition';
import { useNutritionStore } from './useNutritionStore';
vi.mock('../lib/storage', () => ({
  offlineFirstStorage: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/cloudSyncService', async (original) => {
  const actual = await original<typeof import('../services/cloudSyncService')>();
  return {
    ...actual,
    cloudSyncService: {
      connect: vi.fn().mockResolvedValue(undefined),
      capture: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});
const owner = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Test',
  email: 'test@example.test',
  authMode: 'cloud' as const,
};
const legacySet: WorkoutSetLog = {
  id: 'live-og-0025-1',
  exerciseId: 'og-0025',
  setNumber: 1,
  setType: 'working',
  weightKg: 60,
  reps: 8,
  isCompleted: true,
  isPrWeight: false,
  isPr1RM: false,
  estimated1RM: 0,
};
const payload = { startTime: '12:00', endTime: '13:00', durationMinutes: 60, sets: [legacySet] };
describe('history integrity', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
    useNutritionStore.getState().clearActiveSessionState();
    await useNutritionStore.getState().initializeForUser(owner);
    useNutritionStore.getState().completeOnboarding({
      birthDate: '1995-01-01',
      sex: 'male',
      heightCm: 180,
      weightKg: 80,
      initialPal: 1.55,
      trainingExperience: 'intermediate',
      selectedPhase: 'maintenance',
    });
    await Promise.resolve();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());
  it('uses fresh set IDs and does not mutate prior sessions', () => {
    const first = useNutritionStore.getState().logWorkoutSession(payload);
    const second = useNutritionStore
      .getState()
      .logWorkoutSession({ ...payload, sets: [{ ...legacySet, weightKg: 65 }] });
    expect(first.id).not.toBe(second.id);
    expect(first.sets[0].id).not.toBe(second.sets[0].id);
    expect(first.sets[0].id).not.toBe(legacySet.id);
    expect(first.sets[0].weightKg).toBe(60);
    expect(cloudSyncService.capture).toHaveBeenLastCalledWith(
      owner.id,
      expect.objectContaining({ workoutSessions: [second, first] }),
    );
  });
  it('captures the edited historical weigh-in and subsequent trends', () => {
    const base = useNutritionStore.getState().biometricLogs[0];
    useNutritionStore.setState({
      biometricLogs: [
        { ...base, id: crypto.randomUUID(), date: '2026-11-01' },
        { ...base, id: crypto.randomUUID(), date: '2026-11-12' },
      ],
    });
    useNutritionStore.getState().addOrUpdateBiometricLog({ date: '2026-11-01', scaleWeightKg: 79 });
    expect(cloudSyncService.capture).toHaveBeenLastCalledWith(
      owner.id,
      expect.objectContaining({
        biometricLogs: expect.arrayContaining([
          expect.objectContaining({ date: '2026-11-01', scaleWeightKg: 79 }),
          expect.objectContaining({ date: '2026-11-12' }),
        ]),
      }),
    );
  });
  it('ignores a delayed connection after logout', async () => {
    let resolve!: () => void;
    vi.mocked(cloudSyncService.connect).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const hydration = useNutritionStore.getState().initializeForUser(owner);
    for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
    expect(resolve).toBeDefined();
    useNutritionStore.getState().clearActiveSessionState();
    resolve();
    await hydration;
    expect(useNutritionStore.getState().activeUserId).toBeNull();
    expect(useNutritionStore.getState().userProfile).toBeNull();
  });
});
