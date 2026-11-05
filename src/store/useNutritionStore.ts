import { create } from 'zustand';
import type {
  BiologicalSex,
  BiometricLog,
  ExerciseCatalogItem,
  FoodItem,
  MacroBreakdown,
  MetabolicCheckin,
  NutritionalPhase,
  Recipe,
  TimelineLog,
  TrainingExperience,
  UserProfile,
  WorkoutRoutine,
  WorkoutSession,
} from '../types/nutrition';
import {
  calculateAdaptiveTdee,
  calculateAgeFromBirthDate,
  calculateFoodItemMacros,
  calculateHierarchicalMacros,
  calculateTargetCaloriesForPhase,
  evaluateAnthropometrics,
  recalculateBiometricTrends,
  type AdaptiveTdeeResult,
} from '../lib/metabolism';
import {
  calculateEstimated1RM,
  calculateSessionTonnageKg,
  getHistoricalExerciseBest,
} from '../lib/strengthAnalytics';
import {
  INITIAL_FOOD_ITEMS,
  INITIAL_RECIPES,
} from '../data/seedData';
import { OPENGYM_EXERCISE_CATALOG } from '../data/opengymCatalog';
import { offlineFirstStorage } from '../lib/storage';
import {
  cloudSyncService,
  isSeedRecordId,
} from '../services/cloudSyncService';
import type { AuthenticatedUser } from '../services/authService';

export interface CompleteOnboardingPayload {
  name?: string;
  birthDate: string;
  sex: BiologicalSex;
  heightCm: number;
  weightKg: number;
  initialPal: number;
  trainingExperience: TrainingExperience;
  returningFromInactivity?: boolean;
  weeksInCurrentDeficit?: number;
  goalPhysiqueReached?: boolean;
  neckCm?: number;
  waistCm?: number;
  hipCm?: number;
  selectedPhase: NutritionalPhase;
  customAdjustmentPercent?: number;
  ewmaAlpha?: number;
}

export interface AddBiometricPayload {
  date?: string;
  scaleWeightKg: number;
  neckCm?: number;
  waistCm?: number;
  hipCm?: number;
  sleepHours?: number;
  steps?: number;
}

interface PersistedUserSnapshot {
  userProfile: UserProfile | null;
  biometricLogs: BiometricLog[];
  customFoods: FoodItem[];
  favoriteFoodIds: string[];
  customRecipes: Recipe[];
  timelineLogs: TimelineLog[];
  metabolicCheckins: MetabolicCheckin[];
  customExercises: ExerciseCatalogItem[];
  workoutRoutines: WorkoutRoutine[];
  workoutSessions: WorkoutSession[];
}

export interface NutritionState {
  activeUserId: string | null;
  activeUserFullName: string | null;
  userProfile: UserProfile | null;
  biometricLogs: BiometricLog[];
  foods: FoodItem[];
  recipes: Recipe[];
  timelineLogs: TimelineLog[];
  metabolicCheckins: MetabolicCheckin[];
  selectedDate: string;

  // Entidades Fase 5: Catálogo OpenGym, Rutinas y Sesiones de Fuerza
  exerciseCatalog: ExerciseCatalogItem[];
  workoutRoutines: WorkoutRoutine[];
  workoutSessions: WorkoutSession[];

  // Inicialización y aislamiento por cuenta de usuario
  initializeForUser: (
    user: AuthenticatedUser,
    options?: { isNewRegistration?: boolean }
  ) => Promise<void>;
  clearActiveSessionState: () => void;

  // Acciones Fase 1 & 2 (Onboarding, Diagnóstico Antropométrico y Motor Metabólico)
  completeOnboarding: (payload: CompleteOnboardingPayload) => void;
  updatePhaseAndMacros: (
    phase: NutritionalPhase,
    customAdjustmentPercent?: number
  ) => void;
  updateEwmaAlpha: (alpha: number) => void;
  addOrUpdateBiometricLog: (payload: AddBiometricPayload) => void;
  computeCurrentAdaptiveTdeeStatus: () => AdaptiveTdeeResult | null;
  executeWeeklyMetabolicCheckin: (
    approveAdjustment: boolean
  ) => MetabolicCheckin | null;
  resetStoreToOnboarding: () => void;

  // Acciones Fase 3 & 4 (Timeline Logger, Multi-Paste, Alimentos y Recetas)
  setSelectedDate: (date: string) => void;
  addTimelineLog: (entry: {
    date?: string;
    hour: number;
    foodId?: string;
    recipeId?: string;
    customLabel?: string;
    gramsConsumed: number;
    overrideMacros?: MacroBreakdown;
  }) => void;
  updateTimelineLogGrams: (logId: string, gramsConsumed: number) => void;
  removeTimelineLog: (logId: string) => void;
  multiPasteTimelineLogs: (logIds: string[], targetDates: string[]) => void;
  addCustomFood: (food: Omit<FoodItem, 'id' | 'isCustom'>) => FoodItem;
  toggleFavoriteFood: (foodId: string) => void;
  addCustomRecipe: (recipe: Omit<Recipe, 'id'>) => void;

  // Acciones Fase 5 (Gimnasio, Rutinas y Sesiones)
  saveWorkoutRoutine: (routine: WorkoutRoutine) => void;
  addExerciseToRoutine: (routineId: string, exerciseId: string) => void;
  deleteWorkoutRoutine: (routineId: string) => void;
  logWorkoutSession: (payload: {
    routineId?: string;
    routineName?: string;
    date?: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    sets: WorkoutSession['sets'];
  }) => WorkoutSession;
  deleteWorkoutSession: (sessionId: string) => void;
  addCustomExerciseCatalogItem: (
    item: Omit<ExerciseCatalogItem, 'id'>
  ) => ExerciseCatalogItem;
}

const getTodayIso = () => new Date().toISOString().slice(0, 10);

const LEGACY_STORAGE_KEYS = [
  'fitnutricion-offline-v1',
  'fitnutricion-offline-store-v2',
];

const getUserStorageKey = (userId: string) =>
  `fitnutricion-user-data-v2:${userId}`;

async function purgeLegacyGlobalMockStorage(): Promise<void> {
  for (const key of LEGACY_STORAGE_KEYS) {
    await offlineFirstStorage.removeItem(key);
  }
}

function sanitizeSnapshot(
  raw: Partial<PersistedUserSnapshot> | null | undefined,
  user: AuthenticatedUser
): PersistedUserSnapshot {
  const rawProfile = raw?.userProfile ?? null;
  const isMockProfile =
    !rawProfile ||
    rawProfile.id === 'user-local-primary' ||
    !rawProfile.onboardingCompleted;

  const cleanProfile: UserProfile | null = isMockProfile
    ? null
    : {
        ...rawProfile,
        id: user.id,
        name: rawProfile.name?.trim() || user.fullName,
      };

  const cleanBiometricLogs = Array.isArray(raw?.biometricLogs)
    ? raw.biometricLogs.filter((b) => b && !isSeedRecordId(b.id))
    : [];

  const cleanTimelineLogs = Array.isArray(raw?.timelineLogs)
    ? raw.timelineLogs.filter((t) => t && !isSeedRecordId(t.id))
    : [];

  const cleanCheckins = Array.isArray(raw?.metabolicCheckins)
    ? raw.metabolicCheckins
    : [];

  const cleanRoutines = Array.isArray(raw?.workoutRoutines)
    ? raw.workoutRoutines.filter((r) => r && !isSeedRecordId(r.id))
    : [];

  const cleanSessions = Array.isArray(raw?.workoutSessions)
    ? raw.workoutSessions.filter((s) => s && !isSeedRecordId(s.id))
    : [];

  const customFoods = Array.isArray(raw?.customFoods)
    ? raw.customFoods.filter((f) => f && f.isCustom)
    : [];

  const favoriteFoodIds = Array.isArray(raw?.favoriteFoodIds)
    ? raw.favoriteFoodIds
    : INITIAL_FOOD_ITEMS.filter((f) => f.isFavorite).map((f) => f.id);

  const customRecipes = Array.isArray(raw?.customRecipes)
    ? raw.customRecipes
    : [];

  const customExercises = Array.isArray(raw?.customExercises)
    ? raw.customExercises
    : [];

  return {
    userProfile: cleanProfile,
    biometricLogs: cleanBiometricLogs,
    customFoods,
    favoriteFoodIds,
    customRecipes,
    timelineLogs: cleanTimelineLogs,
    metabolicCheckins: cleanCheckins,
    customExercises,
    workoutRoutines: cleanRoutines,
    workoutSessions: cleanSessions,
  };
}

function persistCurrentUserState(state: NutritionState): void {
  if (!state.activeUserId) return;
  const baseFoodIds = new Set(INITIAL_FOOD_ITEMS.map((f) => f.id));
  const baseRecipeIds = new Set(INITIAL_RECIPES.map((r) => r.id));
  const baseExerciseIds = new Set(OPENGYM_EXERCISE_CATALOG.map((e) => e.id));

  const snapshot: PersistedUserSnapshot = {
    userProfile: state.userProfile,
    biometricLogs: state.biometricLogs,
    customFoods: state.foods.filter((f) => !baseFoodIds.has(f.id) || f.isCustom),
    favoriteFoodIds: state.foods.filter((f) => f.isFavorite).map((f) => f.id),
    customRecipes: state.recipes.filter((r) => !baseRecipeIds.has(r.id)),
    timelineLogs: state.timelineLogs,
    metabolicCheckins: state.metabolicCheckins,
    customExercises: state.exerciseCatalog.filter(
      (e) => !baseExerciseIds.has(e.id)
    ),
    workoutRoutines: state.workoutRoutines,
    workoutSessions: state.workoutSessions,
  };

  void offlineFirstStorage.setItem(
    getUserStorageKey(state.activeUserId),
    JSON.stringify(snapshot)
  );
}

export const useNutritionStore = create<NutritionState>()((set, get) => ({
  activeUserId: null,
  activeUserFullName: null,
  userProfile: null,
  biometricLogs: [],
  foods: INITIAL_FOOD_ITEMS,
  recipes: INITIAL_RECIPES,
  timelineLogs: [],
  metabolicCheckins: [],
  selectedDate: getTodayIso(),

  exerciseCatalog: OPENGYM_EXERCISE_CATALOG,
  workoutRoutines: [],
  workoutSessions: [],

  initializeForUser: async (user, options) => {
    await purgeLegacyGlobalMockStorage();

    const isNewRegistration = Boolean(options?.isNewRegistration);

    if (isNewRegistration) {
      set({
        activeUserId: user.id,
        activeUserFullName: user.fullName,
        userProfile: null,
        biometricLogs: [],
        foods: INITIAL_FOOD_ITEMS,
        recipes: INITIAL_RECIPES,
        timelineLogs: [],
        metabolicCheckins: [],
        selectedDate: getTodayIso(),
        exerciseCatalog: OPENGYM_EXERCISE_CATALOG,
        workoutRoutines: [],
        workoutSessions: [],
      });
      persistCurrentUserState(get());
      await cloudSyncService.purgeCloudSeedData(user.id);
      return;
    }

    // Limpiar en memoria cualquier estado previo antes de cargar la cuenta actual
    if (get().activeUserId !== user.id) {
      set({
        activeUserId: user.id,
        activeUserFullName: user.fullName,
        userProfile: null,
        biometricLogs: [],
        foods: INITIAL_FOOD_ITEMS,
        recipes: INITIAL_RECIPES,
        timelineLogs: [],
        metabolicCheckins: [],
        selectedDate: getTodayIso(),
        exerciseCatalog: OPENGYM_EXERCISE_CATALOG,
        workoutRoutines: [],
        workoutSessions: [],
      });
    }

    let localSnapshot: PersistedUserSnapshot = sanitizeSnapshot(null, user);
    try {
      const rawJson = await offlineFirstStorage.getItem(
        getUserStorageKey(user.id)
      );
      if (rawJson) {
        const parsed = JSON.parse(rawJson) as Partial<PersistedUserSnapshot>;
        localSnapshot = sanitizeSnapshot(parsed, user);
      }
    } catch {
      localSnapshot = sanitizeSnapshot(null, user);
    }

    const favSet = new Set(localSnapshot.favoriteFoodIds);
    const mergedFoods = [
      ...localSnapshot.customFoods,
      ...INITIAL_FOOD_ITEMS.map((f) => ({
        ...f,
        isFavorite: favSet.has(f.id),
      })),
    ];
    const mergedRecipes = [...localSnapshot.customRecipes, ...INITIAL_RECIPES];
    const mergedExercises = [
      ...localSnapshot.customExercises,
      ...OPENGYM_EXERCISE_CATALOG,
    ];

    set({
      activeUserId: user.id,
      activeUserFullName: user.fullName,
      userProfile: localSnapshot.userProfile,
      biometricLogs: localSnapshot.biometricLogs,
      foods: mergedFoods,
      recipes: mergedRecipes,
      timelineLogs: localSnapshot.timelineLogs,
      metabolicCheckins: localSnapshot.metabolicCheckins,
      selectedDate: getTodayIso(),
      exerciseCatalog: mergedExercises,
      workoutRoutines: localSnapshot.workoutRoutines,
      workoutSessions: localSnapshot.workoutSessions,
    });

    // Si Supabase Cloud está activo, hidratar datos reales remotos del usuario
    const cloudData = await cloudSyncService.fetchUserCloudData(
      user.id,
      mergedFoods,
      mergedRecipes
    );

    if (cloudData) {
      set((current) => ({
        userProfile: cloudData.userProfile ?? current.userProfile,
        biometricLogs:
          cloudData.biometricLogs.length > 0
            ? cloudData.biometricLogs
            : current.biometricLogs,
        timelineLogs:
          cloudData.timelineLogs.length > 0
            ? cloudData.timelineLogs
            : current.timelineLogs,
        workoutRoutines:
          cloudData.workoutRoutines.length > 0
            ? cloudData.workoutRoutines
            : current.workoutRoutines,
        workoutSessions:
          cloudData.workoutSessions.length > 0
            ? cloudData.workoutSessions
            : current.workoutSessions,
      }));
    }

    persistCurrentUserState(get());
  },

  clearActiveSessionState: () => {
    set({
      activeUserId: null,
      activeUserFullName: null,
      userProfile: null,
      biometricLogs: [],
      foods: INITIAL_FOOD_ITEMS,
      recipes: INITIAL_RECIPES,
      timelineLogs: [],
      metabolicCheckins: [],
      selectedDate: getTodayIso(),
      exerciseCatalog: OPENGYM_EXERCISE_CATALOG,
      workoutRoutines: [],
      workoutSessions: [],
    });
  },

  completeOnboarding: (payload) => {
    const state = get();
    const age = calculateAgeFromBirthDate(payload.birthDate);
    const alpha = payload.ewmaAlpha ?? 0.12;

    const diag = evaluateAnthropometrics({
      sex: payload.sex,
      age,
      heightCm: payload.heightCm,
      weightKg: payload.weightKg,
      pal: payload.initialPal,
      trainingExperience: payload.trainingExperience,
      returningFromInactivity: payload.returningFromInactivity,
      weeksInCurrentDeficit: payload.weeksInCurrentDeficit,
      goalPhysiqueReached: payload.goalPhysiqueReached,
      neckCm: payload.neckCm,
      waistCm: payload.waistCm,
      hipCm: payload.hipCm,
    });

    const phaseCal = calculateTargetCaloriesForPhase({
      activeTdee: diag.initialStaticTdee,
      phase: payload.selectedPhase,
      fatMassKg: diag.fatMassKg,
      customAdjustmentPercent: payload.customAdjustmentPercent,
    });

    const macros = calculateHierarchicalMacros({
      targetKcal: phaseCal.targetKcal,
      weightKg: payload.weightKg,
      lbmKg: diag.lbmKg,
      bfPercent: diag.bfPercent,
      sex: payload.sex,
      phase: payload.selectedPhase,
    });

    const today = getTodayIso();
    const cleanName =
      payload.name?.trim() || state.activeUserFullName || 'Usuario';

    const newProfile: UserProfile = {
      id: state.activeUserId ?? `user-${Date.now()}`,
      name: cleanName,
      birthDate: payload.birthDate,
      sex: payload.sex,
      heightCm: payload.heightCm,
      initialPal: payload.initialPal,
      trainingExperience: payload.trainingExperience,
      returningFromInactivity: Boolean(payload.returningFromInactivity),
      weeksInCurrentDeficit: payload.weeksInCurrentDeficit ?? 0,
      goalPhysiqueReached: Boolean(payload.goalPhysiqueReached),
      currentPhase: payload.selectedPhase,
      phaseAdjustmentPercent: phaseCal.appliedAdjustmentPercent,
      activeTdee: diag.initialStaticTdee,
      bmrKcal: diag.bmrKcal,
      bmrFormulaUsed: diag.bmrFormula,
      targetKcal: phaseCal.targetKcal,
      targetProteinG: macros.proteinG,
      targetCarbsG: macros.carbsG,
      targetFatG: macros.fatG,
      targetFiberG: macros.fiberG,
      targetWaterMl: macros.waterMl,
      ewmaAlpha: alpha,
      onboardingCompleted: true,
      updatedAt: new Date().toISOString(),
    };

    const initialBioLog: BiometricLog = {
      id: `bio-${today}`,
      date: today,
      scaleWeightKg: payload.weightKg,
      trendWeightKg: payload.weightKg,
      neckCm: payload.neckCm,
      waistCm: payload.waistCm,
      hipCm: payload.hipCm,
      estimatedBfPercent: diag.bfPercent,
      bfMethod: diag.bfMethod,
      lbmKg: diag.lbmKg,
      fatMassKg: diag.fatMassKg,
      whtr: diag.whtr,
    };

    const existingRealLogs = state.biometricLogs.filter(
      (b) => !isSeedRecordId(b.id) && b.date !== today
    );
    const updatedBioLogs = recalculateBiometricTrends(
      [...existingRealLogs, initialBioLog],
      alpha
    );
    const latestBioEntry =
      updatedBioLogs[updatedBioLogs.length - 1] ?? initialBioLog;

    set({
      userProfile: newProfile,
      biometricLogs: updatedBioLogs,
      selectedDate: today,
    });

    persistCurrentUserState(get());

    if (state.activeUserId) {
      void cloudSyncService.upsertUserProfile(state.activeUserId, newProfile);
      void cloudSyncService.upsertBiometricLog(
        state.activeUserId,
        latestBioEntry
      );
    }
  },

  updatePhaseAndMacros: (phase, customAdjustmentPercent) => {
    const state = get();
    const profile = state.userProfile;
    if (!profile) return;

    const latestBio =
      state.biometricLogs.length > 0
        ? [...state.biometricLogs].sort((a, b) => a.date.localeCompare(b.date))[
            state.biometricLogs.length - 1
          ]
        : undefined;

    if (!latestBio) return;

    const weightKg = latestBio.trendWeightKg;
    const lbmKg = latestBio.lbmKg;
    const fatMassKg = latestBio.fatMassKg;
    const bfPercent = latestBio.estimatedBfPercent;

    const phaseCal = calculateTargetCaloriesForPhase({
      activeTdee: profile.activeTdee,
      phase,
      fatMassKg,
      customAdjustmentPercent,
    });

    const macros = calculateHierarchicalMacros({
      targetKcal: phaseCal.targetKcal,
      weightKg,
      lbmKg,
      bfPercent,
      sex: profile.sex,
      phase,
    });

    const updatedProfile: UserProfile = {
      ...profile,
      currentPhase: phase,
      phaseAdjustmentPercent: phaseCal.appliedAdjustmentPercent,
      targetKcal: phaseCal.targetKcal,
      targetProteinG: macros.proteinG,
      targetCarbsG: macros.carbsG,
      targetFatG: macros.fatG,
      targetFiberG: macros.fiberG,
      targetWaterMl: macros.waterMl,
      updatedAt: new Date().toISOString(),
    };

    set({ userProfile: updatedProfile });
    persistCurrentUserState(get());

    if (state.activeUserId) {
      void cloudSyncService.upsertUserProfile(
        state.activeUserId,
        updatedProfile
      );
    }
  },

  updateEwmaAlpha: (alpha) => {
    const state = get();
    if (!state.userProfile) return;
    const safeAlpha = Math.max(0.1, Math.min(0.15, alpha));
    const recalculated = recalculateBiometricTrends(
      state.biometricLogs,
      safeAlpha
    );
    const updatedProfile: UserProfile = {
      ...state.userProfile,
      ewmaAlpha: safeAlpha,
      updatedAt: new Date().toISOString(),
    };
    set({
      userProfile: updatedProfile,
      biometricLogs: recalculated,
    });
    persistCurrentUserState(get());

    if (state.activeUserId) {
      void cloudSyncService.upsertUserProfile(
        state.activeUserId,
        updatedProfile
      );
    }
  },

  addOrUpdateBiometricLog: (payload) => {
    const state = get();
    const profile = state.userProfile;
    if (!profile) return;

    const targetDate = payload.date || getTodayIso();
    const age = calculateAgeFromBirthDate(profile.birthDate, targetDate);

    const sortedExisting = [...state.biometricLogs].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const lastKnown = sortedExisting[sortedExisting.length - 1];

    const neckCm = payload.neckCm ?? lastKnown?.neckCm;
    const waistCm = payload.waistCm ?? lastKnown?.waistCm;
    const hipCm = payload.hipCm ?? lastKnown?.hipCm;

    const diag = evaluateAnthropometrics({
      sex: profile.sex,
      age,
      heightCm: profile.heightCm,
      weightKg: payload.scaleWeightKg,
      pal: profile.initialPal,
      trainingExperience: profile.trainingExperience,
      neckCm,
      waistCm,
      hipCm,
    });

    const newEntry: BiometricLog = {
      id: `bio-${targetDate}`,
      date: targetDate,
      scaleWeightKg: payload.scaleWeightKg,
      trendWeightKg: payload.scaleWeightKg,
      neckCm,
      waistCm,
      hipCm,
      estimatedBfPercent: diag.bfPercent,
      bfMethod: diag.bfMethod,
      lbmKg: diag.lbmKg,
      fatMassKg: diag.fatMassKg,
      whtr: diag.whtr,
      sleepHours: payload.sleepHours ?? lastKnown?.sleepHours,
      steps: payload.steps ?? lastKnown?.steps,
    };

    const filtered = state.biometricLogs.filter((b) => b.date !== targetDate);
    const recalculated = recalculateBiometricTrends(
      [...filtered, newEntry],
      profile.ewmaAlpha
    );

    const latestTrendEntry = recalculated[recalculated.length - 1];
    const phaseCal = calculateTargetCaloriesForPhase({
      activeTdee: profile.activeTdee,
      phase: profile.currentPhase,
      fatMassKg: latestTrendEntry.fatMassKg,
      customAdjustmentPercent: profile.phaseAdjustmentPercent,
    });

    const macros = calculateHierarchicalMacros({
      targetKcal: phaseCal.targetKcal,
      weightKg: latestTrendEntry.trendWeightKg,
      lbmKg: latestTrendEntry.lbmKg,
      bfPercent: latestTrendEntry.estimatedBfPercent,
      sex: profile.sex,
      phase: profile.currentPhase,
    });

    const updatedProfile: UserProfile = {
      ...profile,
      bmrKcal: diag.bmrKcal,
      bmrFormulaUsed: diag.bmrFormula,
      targetKcal: phaseCal.targetKcal,
      targetProteinG: macros.proteinG,
      targetCarbsG: macros.carbsG,
      targetFatG: macros.fatG,
      targetFiberG: macros.fiberG,
      targetWaterMl: macros.waterMl,
      updatedAt: new Date().toISOString(),
    };

    set({
      biometricLogs: recalculated,
      userProfile: updatedProfile,
    });
    persistCurrentUserState(get());

    if (state.activeUserId) {
      void cloudSyncService.upsertBiometricLog(
        state.activeUserId,
        latestTrendEntry
      );
      void cloudSyncService.upsertUserProfile(
        state.activeUserId,
        updatedProfile
      );
    }
  },

  computeCurrentAdaptiveTdeeStatus: () => {
    const state = get();
    const profile = state.userProfile;
    if (!profile) return null;

    const sortedBio = [...state.biometricLogs].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const allKnownDates = [
      ...sortedBio.map((b) => b.date),
      ...state.timelineLogs.map((l) => l.date),
    ].sort((a, b) => a.localeCompare(b));

    const anchorDateStr =
      allKnownDates[allKnownDates.length - 1] || getTodayIso();
    const anchorDate = new Date(`${anchorDateStr}T12:00:00Z`);

    const recentDates: string[] = [];
    for (let i = 20; i >= 0; i--) {
      const d = new Date(anchorDate);
      d.setUTCDate(d.getUTCDate() - i);
      recentDates.push(d.toISOString().slice(0, 10));
    }

    const dailyIntakes = recentDates.map((date) => {
      const logsForDay = state.timelineLogs.filter((l) => l.date === date);
      if (logsForDay.length === 0) {
        return { date, kcal: null };
      }
      const totalKcal = logsForDay.reduce(
        (sum, item) => sum + item.calculatedMacros.kcal,
        0
      );
      return { date, kcal: totalKcal > 0 ? totalKcal : null };
    });

    return calculateAdaptiveTdee({
      dailyIntakes,
      biometricLogs: sortedBio,
      previousTdee: profile.activeTdee,
      windowDays: 21,
    });
  },

  executeWeeklyMetabolicCheckin: (approveAdjustment) => {
    const state = get();
    const profile = state.userProfile;
    if (!profile) return null;

    const adaptiveStatus = get().computeCurrentAdaptiveTdeeStatus();
    if (!adaptiveStatus) return null;

    const today = getTodayIso();
    const checkin: MetabolicCheckin = {
      id: `checkin-${today}-${Date.now()}`,
      weekDate: today,
      avgDailyIntakeKcal: adaptiveStatus.avgDailyIntakeKcal,
      weightSlopeKgPerWeek: adaptiveStatus.weightSlopeKgPerWeek,
      calculatedRealTdee: adaptiveStatus.calculatedRealTdee,
      previousTdee: adaptiveStatus.previousTdee,
      appliedTdee: approveAdjustment
        ? adaptiveStatus.appliedTdee
        : adaptiveStatus.previousTdee,
      userApproved: approveAdjustment,
      loggedDaysInWindow: adaptiveStatus.loggedDaysCount,
      imputedDaysInWindow: adaptiveStatus.imputedDaysCount,
    };

    if (!approveAdjustment) {
      set({
        metabolicCheckins: [checkin, ...state.metabolicCheckins],
      });
      persistCurrentUserState(get());
      return checkin;
    }

    const latestBio =
      state.biometricLogs.length > 0
        ? [...state.biometricLogs].sort((a, b) => a.date.localeCompare(b.date))[
            state.biometricLogs.length - 1
          ]
        : undefined;

    if (!latestBio) return null;

    const weightKg = latestBio.trendWeightKg;
    const lbmKg = latestBio.lbmKg;
    const fatMassKg = latestBio.fatMassKg;
    const bfPercent = latestBio.estimatedBfPercent;

    const newActiveTdee = adaptiveStatus.appliedTdee;
    const phaseCal = calculateTargetCaloriesForPhase({
      activeTdee: newActiveTdee,
      phase: profile.currentPhase,
      fatMassKg,
      customAdjustmentPercent: profile.phaseAdjustmentPercent,
    });

    const macros = calculateHierarchicalMacros({
      targetKcal: phaseCal.targetKcal,
      weightKg,
      lbmKg,
      bfPercent,
      sex: profile.sex,
      phase: profile.currentPhase,
    });

    const updatedProfile: UserProfile = {
      ...profile,
      activeTdee: newActiveTdee,
      targetKcal: phaseCal.targetKcal,
      targetProteinG: macros.proteinG,
      targetCarbsG: macros.carbsG,
      targetFatG: macros.fatG,
      targetFiberG: macros.fiberG,
      targetWaterMl: macros.waterMl,
      updatedAt: new Date().toISOString(),
    };

    set({
      metabolicCheckins: [checkin, ...state.metabolicCheckins],
      userProfile: updatedProfile,
    });
    persistCurrentUserState(get());

    if (state.activeUserId) {
      void cloudSyncService.upsertUserProfile(
        state.activeUserId,
        updatedProfile
      );
    }

    return checkin;
  },

  resetStoreToOnboarding: () => {
    set({
      userProfile: null,
      biometricLogs: [],
      timelineLogs: [],
      metabolicCheckins: [],
      workoutRoutines: [],
      workoutSessions: [],
    });
    persistCurrentUserState(get());
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  addTimelineLog: ({
    date,
    hour,
    foodId,
    recipeId,
    customLabel,
    gramsConsumed,
    overrideMacros,
  }) => {
    const state = get();
    const targetDate = date || state.selectedDate;
    let calculatedMacros: MacroBreakdown = overrideMacros ?? {
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
    };

    if (!overrideMacros && foodId) {
      const food = state.foods.find((f) => f.id === foodId);
      if (food) {
        calculatedMacros = calculateFoodItemMacros(food, gramsConsumed);
      }
    } else if (!overrideMacros && recipeId) {
      const recipe = state.recipes.find((r) => r.id === recipeId);
      if (recipe) {
        const ratio =
          gramsConsumed / Math.max(1, recipe.totalMacros.totalGrams);
        calculatedMacros = {
          kcal: Math.round(recipe.totalMacros.kcal * ratio),
          proteinG: Number((recipe.totalMacros.proteinG * ratio).toFixed(1)),
          carbsG: Number((recipe.totalMacros.carbsG * ratio).toFixed(1)),
          fatG: Number((recipe.totalMacros.fatG * ratio).toFixed(1)),
          fiberG: Number((recipe.totalMacros.fiberG * ratio).toFixed(1)),
        };
      }
    }

    const newLog: TimelineLog = {
      id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: targetDate,
      hour: Math.max(0, Math.min(23, hour)),
      foodId,
      recipeId,
      customLabel,
      gramsConsumed,
      calculatedMacros,
    };

    set({
      timelineLogs: [...state.timelineLogs, newLog],
    });
    persistCurrentUserState(get());

    if (state.activeUserId) {
      void cloudSyncService.insertTimelineLog(state.activeUserId, newLog);
    }
  },

  updateTimelineLogGrams: (logId, gramsConsumed) => {
    const state = get();
    const updated = state.timelineLogs.map((log) => {
      if (log.id !== logId) return log;
      if (log.foodId) {
        const food = state.foods.find((f) => f.id === log.foodId);
        if (food) {
          return {
            ...log,
            gramsConsumed,
            calculatedMacros: calculateFoodItemMacros(food, gramsConsumed),
          };
        }
      }
      const ratio = gramsConsumed / Math.max(1, log.gramsConsumed);
      return {
        ...log,
        gramsConsumed,
        calculatedMacros: {
          kcal: Math.round(log.calculatedMacros.kcal * ratio),
          proteinG: Number((log.calculatedMacros.proteinG * ratio).toFixed(1)),
          carbsG: Number((log.calculatedMacros.carbsG * ratio).toFixed(1)),
          fatG: Number((log.calculatedMacros.fatG * ratio).toFixed(1)),
          fiberG: Number((log.calculatedMacros.fiberG * ratio).toFixed(1)),
        },
      };
    });
    set({ timelineLogs: updated });
    persistCurrentUserState(get());
  },

  removeTimelineLog: (logId) => {
    const state = get();
    set({
      timelineLogs: state.timelineLogs.filter((l) => l.id !== logId),
    });
    persistCurrentUserState(get());
    if (state.activeUserId) {
      void cloudSyncService.deleteTimelineLog(state.activeUserId, logId);
    }
  },

  multiPasteTimelineLogs: (logIds, targetDates) => {
    const state = get();
    const selectedLogs = state.timelineLogs.filter((l) =>
      logIds.includes(l.id)
    );
    if (selectedLogs.length === 0 || targetDates.length === 0) return;

    const clonedLogs: TimelineLog[] = [];
    for (const date of targetDates) {
      for (const item of selectedLogs) {
        const cloned: TimelineLog = {
          ...item,
          id: `tl-paste-${date}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          date,
        };
        clonedLogs.push(cloned);
        if (state.activeUserId) {
          void cloudSyncService.insertTimelineLog(state.activeUserId, cloned);
        }
      }
    }

    set({
      timelineLogs: [...state.timelineLogs, ...clonedLogs],
    });
    persistCurrentUserState(get());
  },

  addCustomFood: (foodData) => {
    const newFood: FoodItem = {
      ...foodData,
      id: `food-custom-${Date.now()}`,
      isCustom: true,
    };
    set((state) => ({
      foods: [newFood, ...state.foods],
    }));
    persistCurrentUserState(get());
    return newFood;
  },

  toggleFavoriteFood: (foodId) => {
    set((state) => ({
      foods: state.foods.map((f) =>
        f.id === foodId ? { ...f, isFavorite: !f.isFavorite } : f
      ),
    }));
    persistCurrentUserState(get());
  },

  addCustomRecipe: (recipeData) => {
    const newRecipe: Recipe = {
      ...recipeData,
      id: `recipe-custom-${Date.now()}`,
    };
    set((state) => ({
      recipes: [newRecipe, ...state.recipes],
    }));
    persistCurrentUserState(get());
  },

  // ======================================================================
  // ACCIONES FASE 5: GIMNASIO, RUTINAS Y SESIONES
  // ======================================================================

  saveWorkoutRoutine: (routine) => {
    set((state) => {
      const exists = state.workoutRoutines.some((r) => r.id === routine.id);
      if (exists) {
        return {
          workoutRoutines: state.workoutRoutines.map((r) =>
            r.id === routine.id ? routine : r
          ),
        };
      }
      return {
        workoutRoutines: [...state.workoutRoutines, routine],
      };
    });
    persistCurrentUserState(get());

    const activeUserId = get().activeUserId;
    if (activeUserId) {
      void cloudSyncService.upsertWorkoutRoutine(activeUserId, routine);
    }
  },

  addExerciseToRoutine: (routineId, exerciseId) => {
    set((state) => ({
      workoutRoutines: state.workoutRoutines.map((r) => {
        if (r.id !== routineId) return r;
        if (r.exercises.some((e) => e.exerciseId === exerciseId)) return r;
        return {
          ...r,
          exercises: [
            ...r.exercises,
            {
              exerciseId,
              order: r.exercises.length + 1,
              targetSets: 3,
              targetRepRange: [8, 12],
              targetRir: 1,
              restSeconds: 120,
              progressionRule: 'double_progression',
            },
          ],
        };
      }),
    }));
    persistCurrentUserState(get());

    const state = get();
    const updated = state.workoutRoutines.find((r) => r.id === routineId);
    if (state.activeUserId && updated) {
      void cloudSyncService.upsertWorkoutRoutine(state.activeUserId, updated);
    }
  },

  deleteWorkoutRoutine: (routineId) => {
    const state = get();
    set({
      workoutRoutines: state.workoutRoutines.filter((r) => r.id !== routineId),
    });
    persistCurrentUserState(get());
    if (state.activeUserId) {
      void cloudSyncService.deleteWorkoutRoutine(state.activeUserId, routineId);
    }
  },

  logWorkoutSession: (payload) => {
    const state = get();
    const sessionDate = payload.date || getTodayIso();

    // Tomar automáticamente bodyweightKgAtSession del BiometricLog del día o del más reciente del usuario
    const exactDayBio = state.biometricLogs.find((b) => b.date === sessionDate);
    const sortedBio = [...state.biometricLogs].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const fallbackBio = sortedBio[sortedBio.length - 1];
    const bodyweightKgAtSession =
      exactDayBio?.scaleWeightKg ?? fallbackBio?.scaleWeightKg ?? 70;

    // Recalcular PRs y 1RM para todas las series efectivas completadas
    const processedSets = payload.sets.map((s) => {
      const estimated1RM = calculateEstimated1RM(
        s.weightKg,
        s.reps,
        s.setType
      );
      const bestPrev = getHistoricalExerciseBest(
        s.exerciseId,
        state.workoutSessions
      );
      const isEffective = s.isCompleted && s.setType !== 'warmup';
      return {
        ...s,
        estimated1RM,
        isPrWeight: isEffective && s.weightKg > bestPrev.maxWeightKg,
        isPr1RM: isEffective && estimated1RM > bestPrev.max1RMKg,
      };
    });

    const totalVolumeKg = calculateSessionTonnageKg(processedSets);

    const newSession: WorkoutSession = {
      id: `ws-${sessionDate}-${Date.now()}`,
      routineId: payload.routineId,
      routineName: payload.routineName || 'Sesión de Fuerza',
      date: sessionDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationMinutes: payload.durationMinutes,
      bodyweightKgAtSession,
      totalVolumeKg,
      sets: processedSets,
    };

    set({
      workoutSessions: [newSession, ...state.workoutSessions],
    });
    persistCurrentUserState(get());

    if (state.activeUserId) {
      void cloudSyncService.insertWorkoutSession(
        state.activeUserId,
        newSession
      );
    }

    return newSession;
  },

  deleteWorkoutSession: (sessionId) => {
    const state = get();
    set({
      workoutSessions: state.workoutSessions.filter((s) => s.id !== sessionId),
    });
    persistCurrentUserState(get());
    if (state.activeUserId) {
      void cloudSyncService.deleteWorkoutSession(state.activeUserId, sessionId);
    }
  },

  addCustomExerciseCatalogItem: (item) => {
    const newItem: ExerciseCatalogItem = {
      ...item,
      id: `og-custom-${Date.now()}`,
    };
    set((state) => ({
      exerciseCatalog: [newItem, ...state.exerciseCatalog],
    }));
    persistCurrentUserState(get());
    return newItem;
  },
}));
