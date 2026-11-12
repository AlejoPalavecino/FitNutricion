import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutSetLog } from '../types/nutrition';
vi.mock('../lib/storage', () => ({ offlineFirstStorage: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(undefined), removeItem: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../services/cloudSyncService', async (original) => {
  const actual = await original<typeof import('../services/cloudSyncService')>();
  return { ...actual, cloudSyncService: {
    fetchUserCloudData: vi.fn().mockResolvedValue(null), purgeCloudSeedData: vi.fn().mockResolvedValue(undefined),
    upsertUserProfile: vi.fn().mockResolvedValue({ status: 'synced' }),
    upsertBiometricLog: vi.fn().mockResolvedValue({ status: 'synced' }),
    insertWorkoutSession: vi.fn().mockResolvedValue({ status: 'synced' }),
  } };
});
import { useNutritionStore } from './useNutritionStore';
import { cloudSyncService } from '../services/cloudSyncService';
const owner = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Test', email: 'test@example.test', authMode: 'cloud' as const };
const legacySet: WorkoutSetLog = { id: 'live-og-0025-1', exerciseId: 'og-0025', setNumber: 1, setType: 'working', weightKg: 60, reps: 8, isCompleted: true, isPrWeight: false, isPr1RM: false, estimated1RM: 0 };
const payload = { startTime: '12:00', endTime: '13:00', durationMinutes: 60, sets: [legacySet] };
describe('history integrity', () => {
  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
    useNutritionStore.getState().clearActiveSessionState();
    await useNutritionStore.getState().initializeForUser(owner);
    useNutritionStore.getState().completeOnboarding({ birthDate: '1995-01-01', sex: 'male', heightCm: 180, weightKg: 80, initialPal: 1.55, trainingExperience: 'intermediate', selectedPhase: 'maintenance' });
    await Promise.resolve();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());
  it('does not reuse legacy set IDs between sessions or mutate a previous session', () => {
    const first = useNutritionStore.getState().logWorkoutSession(payload);
    const second = useNutritionStore.getState().logWorkoutSession({ ...payload, sets: [{ ...legacySet, weightKg: 65 }] });
    expect(first.id).not.toBe(second.id);
    expect(first.sets[0].id).not.toBe(second.sets[0].id);
    expect(first.sets[0].id).not.toBe(legacySet.id);
    expect(first.sets[0].weightKg).toBe(60);
    expect(cloudSyncService.insertWorkoutSession).toHaveBeenNthCalledWith(1, owner.id, first);
  });
  it('syncs an edited historical weigh-in, not only the newest row', () => {
    const base = useNutritionStore.getState().biometricLogs[0];
    useNutritionStore.setState({ biometricLogs: [{ ...base, id: crypto.randomUUID(), date: '2026-11-01' }, { ...base, id: crypto.randomUUID(), date: '2026-11-12' }] });
    useNutritionStore.getState().addOrUpdateBiometricLog({ date: '2026-11-01', scaleWeightKg: 79 });
    expect(cloudSyncService.upsertBiometricLog).toHaveBeenCalledWith(owner.id, expect.objectContaining({ date: '2026-11-01', scaleWeightKg: 79 }));
    expect(cloudSyncService.upsertBiometricLog).toHaveBeenCalledWith(owner.id, expect.objectContaining({ date: '2026-11-12' }));
  });
  it('ignores late cloud hydration after logout', async () => {
    let resolve!: (value: null) => void;
    vi.mocked(cloudSyncService.fetchUserCloudData).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const hydration = useNutritionStore.getState().initializeForUser(owner);
    for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
    expect(resolve).toBeDefined();
    useNutritionStore.getState().clearActiveSessionState(); resolve(null); await hydration;
    expect(useNutritionStore.getState().activeUserId).toBeNull();
    expect(useNutritionStore.getState().userProfile).toBeNull();
  });
});
