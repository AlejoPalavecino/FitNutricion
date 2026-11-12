import { localDate, addDays, weekStart, isCivilDate } from '../lib/dates';
import { reportLocalFailure, useSyncStatusStore } from './useSyncStatusStore';
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
  WorkoutSetLog,
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
  generateUuid,
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

export interface ActiveWorkoutDraft {
  routineId: string;
  startedAtIso: string;
  setsByExercise: Record<string, WorkoutSetLog[]>;
  restTimerEndsAtMs: number | null;
  restTimerTotalSeconds: number;
  restTimerExerciseName: string;
  updatedAt: string;
}

export interface OnboardingDraft {
  step: 1 | 2 | 3;
  name: string;
  sex: BiologicalSex;
  birthDate: string;
  heightCm: number | '';
  weightKg: number | '';
  pal: number;
  experience: TrainingExperience;
  neckCm: number | '';
  waistCm: number | '';
  hipCm: number | '';
  selectedPhase: NutritionalPhase | null;
}

export interface PersistedUserSnapshot {
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
  activeWorkoutDraft: ActiveWorkoutDraft | null;
  routineEditorDraft: WorkoutRoutine | null;
  onboardingDraft: OnboardingDraft | null;
  deletedRecordIds: string[];
  completedNutritionDates: string[];
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

  // Borradores persistentes para evitar cualquier pérdida de datos al navegar o recargar
  activeWorkoutDraft: ActiveWorkoutDraft | null;
  routineEditorDraft: WorkoutRoutine | null;
  onboardingDraft: OnboardingDraft | null;
  deletedRecordIds: string[];
  completedNutritionDates: string[];

  // Inicialización y aislamiento por cuenta de usuario
  initializeForUser: (
    user: AuthenticatedUser,
    options?: { isNewRegistration?: boolean }
  ) => Promise<void>;
  clearActiveSessionState: () => void;

  // Acciones de borradores persistentes
  setActiveWorkoutDraft: (
    updater:
      | ActiveWorkoutDraft
      | null
      | ((prev: ActiveWorkoutDraft | null) => ActiveWorkoutDraft | null)
  ) => void;
  setRoutineEditorDraft: (
    updater:
      | WorkoutRoutine
      | null
      | ((prev: WorkoutRoutine | null) => WorkoutRoutine | null)
  ) => void;
  setOnboardingDraft: (
    updater:
      | OnboardingDraft
      | null
      | ((prev: OnboardingDraft | null) => OnboardingDraft | null)
  ) => void;

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
  markNutritionDayComplete: (date: string, complete: boolean) => void;
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

let sessionGeneration = 0;

const getTodayIso = localDate;

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
  const deletedSet = new Set(
    Array.isArray(raw?.deletedRecordIds) ? raw.deletedRecordIds : []
  );

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
    ? raw.biometricLogs.filter(
        (b) => b && !isSeedRecordId(b.id) && !deletedSet.has(b.id)
      )
    : [];

  const cleanTimelineLogs = Array.isArray(raw?.timelineLogs)
    ? raw.timelineLogs.filter(
        (t) => t && !isSeedRecordId(t.id) && !deletedSet.has(t.id)
      )
    : [];

  const cleanCheckins = Array.isArray(raw?.metabolicCheckins)
    ? raw.metabolicCheckins.filter((c) => c && !deletedSet.has(c.id))
    : [];

  const cleanRoutines = Array.isArray(raw?.workoutRoutines)
    ? raw.workoutRoutines.filter(
        (r) => r && !isSeedRecordId(r.id) && !deletedSet.has(r.id)
      )
    : [];

  const cleanSessions = Array.isArray(raw?.workoutSessions)
    ? raw.workoutSessions.filter(
        (s) => s && !isSeedRecordId(s.id) && !deletedSet.has(s.id)
      )
    : [];

  const customFoods = Array.isArray(raw?.customFoods)
    ? raw.customFoods.filter((f) => f && f.isCustom && !deletedSet.has(f.id))
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
    activeWorkoutDraft: raw?.activeWorkoutDraft ?? null,
    routineEditorDraft: raw?.routineEditorDraft ?? null,
    onboardingDraft: raw?.onboardingDraft ?? null,
    deletedRecordIds: Array.from(deletedSet),
    completedNutritionDates: Array.isArray(raw?.completedNutritionDates) ? raw.completedNutritionDates.filter(isCivilDate) : [],
  };
}

function snapshotFromState(state: NutritionState): PersistedUserSnapshot {
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
    activeWorkoutDraft: state.activeWorkoutDraft,
    routineEditorDraft: state.routineEditorDraft,
    onboardingDraft: state.onboardingDraft,
    deletedRecordIds: state.deletedRecordIds,
    completedNutritionDates: state.completedNutritionDates,
  };

  return snapshot;
}
function persistCurrentUserState(state: NutritionState, capture = true): void {
  if (!state.activeUserId) return;
  const snapshot = snapshotFromState(state);
  void Promise.resolve(offlineFirstStorage.setItem(getUserStorageKey(state.activeUserId), JSON.stringify(snapshot))).catch(reportLocalFailure);
  if (capture) cloudSyncService.capture(state.activeUserId, snapshot);
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

  activeWorkoutDraft: null,
  routineEditorDraft: null,
  onboardingDraft: null,
  deletedRecordIds: [],
  completedNutritionDates: [],

  initializeForUser: async (user, options) => {
    const generation = ++sessionGeneration;
    await purgeLegacyGlobalMockStorage();
    if (generation !== sessionGeneration) return;

    const isNewRegistration = Boolean(options?.isNewRegistration);

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
        activeWorkoutDraft: null,
        routineEditorDraft: null,
        onboardingDraft: null,
        deletedRecordIds: [],
  completedNutritionDates: [],
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

    if (generation !== sessionGeneration || get().activeUserId !== user.id) return;
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
      activeWorkoutDraft: localSnapshot.activeWorkoutDraft,
      routineEditorDraft: localSnapshot.routineEditorDraft,
      onboardingDraft: localSnapshot.onboardingDraft,
      deletedRecordIds: localSnapshot.deletedRecordIds,
      completedNutritionDates: localSnapshot.completedNutritionDates,
    });

    await cloudSyncService.connect(user, snapshotFromState(get()), (remote) => {
      if (generation !== sessionGeneration || get().activeUserId !== user.id) return;
      const favorites = new Set(remote.favoriteFoodIds);
      set({ userProfile: remote.userProfile,
        biometricLogs: recalculateBiometricTrends(remote.biometricLogs, remote.userProfile?.ewmaAlpha ?? 0.12),
        foods: [...remote.customFoods, ...INITIAL_FOOD_ITEMS.map((f) => ({ ...f, isFavorite: favorites.has(f.id) }))],
        recipes: [...remote.customRecipes, ...INITIAL_RECIPES],
        exerciseCatalog: [...remote.customExercises, ...OPENGYM_EXERCISE_CATALOG],
        timelineLogs: remote.timelineLogs, metabolicCheckins: remote.metabolicCheckins,
        workoutRoutines: remote.workoutRoutines, workoutSessions: remote.workoutSessions,
        deletedRecordIds: remote.deletedRecordIds, completedNutritionDates: remote.completedNutritionDates ?? [] });
      persistCurrentUserState(get(), false);
    });
    if (generation === sessionGeneration) persistCurrentUserState(get(), false);
  },

  clearActiveSessionState: () => {
    cloudSyncService.disconnect();
    sessionGeneration += 1;
    useSyncStatusStore.getState().reset();
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
      activeWorkoutDraft: null,
      routineEditorDraft: null,
      onboardingDraft: null,
      deletedRecordIds: [],
  completedNutritionDates: [],
    });
  },

  setActiveWorkoutDraft: (updater) => {
    set((state) => {
      const next =
        typeof updater === 'function'
          ? updater(state.activeWorkoutDraft)
          : updater;
      return { activeWorkoutDraft: next };
    });
    persistCurrentUserState(get());
  },

  setRoutineEditorDraft: (updater) => {
    set((state) => {
      const next =
        typeof updater === 'function'
          ? updater(state.routineEditorDraft)
          : updater;
      return { routineEditorDraft: next };
    });
    persistCurrentUserState(get());
  },

  setOnboardingDraft: (updater) => {
    set((state) => {
      const next =
        typeof updater === 'function'
          ? updater(state.onboardingDraft)
          : updater;
      return { onboardingDraft: next };
    });
    persistCurrentUserState(get());
  },

  completeOnboarding: (payload) => {
    const state = get();
    const age = calculateAgeFromBirthDate(payload.birthDate);
    if (age < 18 || age > 100) throw new RangeError('El plan automático está limitado a personas adultas.');
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
      targetKcal: macros.kcal,
      targetAdjustmentReason: macros.energyAdjustmentReason ?? undefined,
      targetProteinG: macros.proteinG,
      targetCarbsG: macros.carbsG,
      targetFatG: macros.fatG,
      targetFiberG: macros.fiberG,
      targetWaterMl: macros.waterMl,
      ewmaAlpha: alpha,
      onboardingCompleted: true,
      updatedAt: new Date().toISOString(),
    };

    const existingTodayBio = state.biometricLogs.find((b) => b.date === today);
    const initialBioLog: BiometricLog = {
      id: existingTodayBio?.id ?? generateUuid(),
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
      onboardingDraft: null,
    });

    persistCurrentUserState(get());


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
      targetKcal: macros.kcal,
      targetAdjustmentReason: macros.energyAdjustmentReason ?? undefined,
      targetProteinG: macros.proteinG,
      targetCarbsG: macros.carbsG,
      targetFatG: macros.fatG,
      targetFiberG: macros.fiberG,
      targetWaterMl: macros.waterMl,
      updatedAt: new Date().toISOString(),
    };

    set({ userProfile: updatedProfile });
    persistCurrentUserState(get());


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


  },

  addOrUpdateBiometricLog: (payload) => {
    const state = get();
    const profile = state.userProfile;
    if (!profile) return;

    const targetDate = payload.date || getTodayIso();
    if (!isCivilDate(targetDate) || targetDate > getTodayIso() || !Number.isFinite(payload.scaleWeightKg) || payload.scaleWeightKg < 30 || payload.scaleWeightKg > 250) throw new RangeError('Pesaje inválido.');
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

    const existingForDate = state.biometricLogs.find(
      (b) => b.date === targetDate
    );

    const newEntry: BiometricLog = {
      id: existingForDate?.id ?? generateUuid(),
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
      targetKcal: macros.kcal,
      targetAdjustmentReason: macros.energyAdjustmentReason ?? undefined,
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


  },

  computeCurrentAdaptiveTdeeStatus: () => {
    const state = get();
    const profile = state.userProfile;
    if (!profile) return null;

    const sortedBio = [...state.biometricLogs].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const anchorDateStr = getTodayIso();
    const recentDates = Array.from({length:21},(_,i)=>addDays(anchorDateStr,i-20));

    const dailyIntakes = recentDates.map((date) => {
      const logsForDay = state.timelineLogs.filter((l) => l.date === date);
      if (logsForDay.length === 0) {
        return { date, kcal: null };
      }
      const totalKcal = logsForDay.reduce(
        (sum, item) => sum + item.calculatedMacros.kcal,
        0
      );
      return { date, kcal: totalKcal > 0 ? totalKcal : null, isComplete: state.completedNutritionDates.includes(date) };
    });

    return calculateAdaptiveTdee({
      dailyIntakes,
      biometricLogs: sortedBio,
      previousTdee: profile.activeTdee,
      windowDays: 21,
      referenceDate: anchorDateStr,
    });
  },

  executeWeeklyMetabolicCheckin: (approveAdjustment) => {
    const state = get();
    const profile = state.userProfile;
    if (!profile) return null;

    const adaptiveStatus = get().computeCurrentAdaptiveTdeeStatus();
    if (!adaptiveStatus?.isReadyForAdaptive) return null;

    const today = getTodayIso();
    const period = weekStart(today);
    const existing = state.metabolicCheckins.find(c => weekStart(c.weekDate) === period);
    if (existing) return existing;
    const checkin: MetabolicCheckin = {
      id: `checkin-${period}`,
      weekDate: period,
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
      targetKcal: macros.kcal,
      targetAdjustmentReason: macros.energyAdjustmentReason ?? undefined,
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
      activeWorkoutDraft: null,
      routineEditorDraft: null,
      onboardingDraft: null,
    });
    persistCurrentUserState(get());
  },

  setSelectedDate: (date) => { if (isCivilDate(date)) set({ selectedDate: date }); },
  markNutritionDayComplete: (date, complete) => {
    const state=get();
    if (!isCivilDate(date)||date>getTodayIso()||!state.timelineLogs.some(l=>l.date===date)) return;
    set({completedNutritionDates: complete ? Array.from(new Set([...state.completedNutritionDates,date])) : state.completedNutritionDates.filter(d=>d!==date)});
    persistCurrentUserState(get());
  },

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

    const matchedFood = foodId
      ? state.foods.find((f) => f.id === foodId)
      : undefined;

    if (!overrideMacros && matchedFood) {
      calculatedMacros = calculateFoodItemMacros(matchedFood, gramsConsumed);
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
      id: generateUuid(),
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
      completedNutritionDates: state.completedNutritionDates.filter(d=>d!==targetDate),
    });
    persistCurrentUserState(get());


  },

  updateTimelineLogGrams: (logId, gramsConsumed) => {
    const state = get();
    const safeGrams = Math.max(1, gramsConsumed);
    const updated = state.timelineLogs.map((log) => {
      if (log.id !== logId) return log;
      if (log.foodId) {
        const food = state.foods.find((f) => f.id === log.foodId);
        if (food) {
          return {
            ...log,
            gramsConsumed: safeGrams,
            calculatedMacros: calculateFoodItemMacros(food, safeGrams),
          };
        }
      }
      const ratio = safeGrams / Math.max(1, log.gramsConsumed);
      return {
        ...log,
        gramsConsumed: safeGrams,
        calculatedMacros: {
          kcal: Math.round(log.calculatedMacros.kcal * ratio),
          proteinG: Number((log.calculatedMacros.proteinG * ratio).toFixed(1)),
          carbsG: Number((log.calculatedMacros.carbsG * ratio).toFixed(1)),
          fatG: Number((log.calculatedMacros.fatG * ratio).toFixed(1)),
          fiberG: Number((log.calculatedMacros.fiberG * ratio).toFixed(1)),
        },
      };
    });
    set({ timelineLogs: updated, completedNutritionDates: state.completedNutritionDates.filter(d=>d!==state.timelineLogs.find(l=>l.id===logId)?.date) });
    persistCurrentUserState(get());


  },

  removeTimelineLog: (logId) => {
    const state = get();
    set({
      timelineLogs: state.timelineLogs.filter((l) => l.id !== logId),
      completedNutritionDates: state.completedNutritionDates.filter(d=>d!==state.timelineLogs.find(l=>l.id===logId)?.date),
      deletedRecordIds: Array.from(new Set([...state.deletedRecordIds, logId])),
    });
    persistCurrentUserState(get());

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
          id: generateUuid(),
          date,
        };
        clonedLogs.push(cloned);

      }
    }

    set({
      timelineLogs: [...state.timelineLogs, ...clonedLogs],
      completedNutritionDates: state.completedNutritionDates.filter(d=>!targetDates.includes(d)),
    });
    persistCurrentUserState(get());
  },

  addCustomFood: (foodData) => {
    const state = get();
    const providedId = (foodData as Partial<FoodItem>).id;
    const newFood: FoodItem = {
      ...foodData,
      id: providedId || `food-custom-${Date.now()}`,
      isCustom: true,
    };
    set((curr) => ({
      foods: [newFood, ...curr.foods.filter((f) => f.id !== newFood.id)],
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
    const state = get();
    const updatedFood = state.foods.find((f) => f.id === foodId);

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
      const nextRoutines = exists
        ? state.workoutRoutines.map((r) => (r.id === routine.id ? routine : r))
        : [...state.workoutRoutines, routine];
      return {
        workoutRoutines: nextRoutines,
        routineEditorDraft: routine,
        deletedRecordIds: state.deletedRecordIds.filter(
          (id) => id !== routine.id
        ),
      };
    });
    persistCurrentUserState(get());

    const activeUserId = get().activeUserId;

  },

  addExerciseToRoutine: (routineId, exerciseId) => {
    set((state) => {
      const updatedRoutines = state.workoutRoutines.map((r) => {
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
              targetRepRange: [8, 12] as [number, number],
              targetRir: 1,
              restSeconds: 120,
              progressionRule: 'double_progression' as const,
            },
          ],
        };
      });
      const updatedTarget =
        updatedRoutines.find((r) => r.id === routineId) ?? null;
      return {
        workoutRoutines: updatedRoutines,
        routineEditorDraft:
          state.routineEditorDraft?.id === routineId && updatedTarget
            ? updatedTarget
            : state.routineEditorDraft,
      };
    });
    persistCurrentUserState(get());

    const state = get();
    const updated = state.workoutRoutines.find((r) => r.id === routineId);

  },

  deleteWorkoutRoutine: (routineId) => {
    const state = get();
    const remaining = state.workoutRoutines.filter((r) => r.id !== routineId);
    set({
      workoutRoutines: remaining,
      activeWorkoutDraft:
        state.activeWorkoutDraft?.routineId === routineId
          ? null
          : state.activeWorkoutDraft,
      routineEditorDraft:
        state.routineEditorDraft?.id === routineId
          ? remaining[0] ?? null
          : state.routineEditorDraft,
      deletedRecordIds: Array.from(
        new Set([...state.deletedRecordIds, routineId])
      ),
    });
    persistCurrentUserState(get());

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
        // Materialize a new persisted entity even when recovering a legacy draft.
        // This ID is generated once here and reused by every sync retry.
        id: generateUuid(),
        estimated1RM,
        isPrWeight: isEffective && s.weightKg > bestPrev.maxWeightKg,
        isPr1RM: isEffective && estimated1RM > bestPrev.max1RMKg,
      };
    });

    const totalVolumeKg = calculateSessionTonnageKg(processedSets);

    const newSession: WorkoutSession = {
      id: generateUuid(),
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
      activeWorkoutDraft: null,
    });
    persistCurrentUserState(get());



    return newSession;
  },

  deleteWorkoutSession: (sessionId) => {
    const state = get();
    set({
      workoutSessions: state.workoutSessions.filter((s) => s.id !== sessionId),
      deletedRecordIds: Array.from(
        new Set([...state.deletedRecordIds, sessionId])
      ),
    });
    persistCurrentUserState(get());

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
