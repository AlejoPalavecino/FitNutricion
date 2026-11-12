import { create } from 'zustand';
import { OPENGYM_EXERCISE_CATALOG } from '../data/opengymCatalog';
import { INITIAL_FOOD_ITEMS, INITIAL_RECIPES } from '../data/seedData';
import { snapshotSchema } from '../domain/validation';
import { isCivilDate, localDate } from '../lib/dates';
import { recalculateBiometricTrends, type AdaptiveTdeeResult } from '../lib/metabolism';
import { offlineFirstStorage } from '../lib/storage';
import type { AuthenticatedUser } from '../services/authService';
import { cloudSyncService, isSeedRecordId } from '../services/cloudSyncService';
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
import { createNutritionActions } from './slices/nutrition';
import { createProfileActions } from './slices/profile';
import { createWorkoutsActions } from './slices/workouts';
import { reportLocalFailure, useSyncStatusStore } from './useSyncStatusStore';

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
    options?: { isNewRegistration?: boolean },
  ) => Promise<void>;
  clearActiveSessionState: () => void;

  // Acciones de borradores persistentes
  setActiveWorkoutDraft: (
    updater:
      ActiveWorkoutDraft | null | ((prev: ActiveWorkoutDraft | null) => ActiveWorkoutDraft | null),
  ) => void;
  setRoutineEditorDraft: (
    updater: WorkoutRoutine | null | ((prev: WorkoutRoutine | null) => WorkoutRoutine | null),
  ) => void;
  setOnboardingDraft: (
    updater: OnboardingDraft | null | ((prev: OnboardingDraft | null) => OnboardingDraft | null),
  ) => void;

  // Acciones Fase 1 & 2 (Onboarding, Diagnóstico Antropométrico y Motor Metabólico)
  completeOnboarding: (payload: CompleteOnboardingPayload) => void;
  updatePhaseAndMacros: (phase: NutritionalPhase, customAdjustmentPercent?: number) => void;
  updateEwmaAlpha: (alpha: number) => void;
  addOrUpdateBiometricLog: (payload: AddBiometricPayload) => void;
  computeCurrentAdaptiveTdeeStatus: () => AdaptiveTdeeResult | null;
  executeWeeklyMetabolicCheckin: (approveAdjustment: boolean) => MetabolicCheckin | null;
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
  addCustomExerciseCatalogItem: (item: Omit<ExerciseCatalogItem, 'id'>) => ExerciseCatalogItem;
}

let sessionGeneration = 0;

const getTodayIso = localDate;

const LEGACY_STORAGE_KEYS = ['fitnutricion-offline-v1', 'fitnutricion-offline-store-v2'];

const getUserStorageKey = (userId: string) => `fitnutricion-user-data-v2:${userId}`;

async function purgeLegacyGlobalMockStorage(): Promise<void> {
  for (const key of LEGACY_STORAGE_KEYS) {
    await offlineFirstStorage.removeItem(key);
  }
}

function sanitizeSnapshot(
  raw: Partial<PersistedUserSnapshot> | null | undefined,
  user: AuthenticatedUser,
): PersistedUserSnapshot {
  const deletedSet = new Set(Array.isArray(raw?.deletedRecordIds) ? raw.deletedRecordIds : []);

  const rawProfile = raw?.userProfile ?? null;
  const isMockProfile =
    !rawProfile || rawProfile.id === 'user-local-primary' || !rawProfile.onboardingCompleted;

  const cleanProfile: UserProfile | null = isMockProfile
    ? null
    : {
        ...rawProfile,
        id: user.id,
        name: rawProfile.name?.trim() || user.fullName,
      };

  const cleanBiometricLogs = Array.isArray(raw?.biometricLogs)
    ? raw.biometricLogs.filter((b) => b && !isSeedRecordId(b.id) && !deletedSet.has(b.id))
    : [];

  const cleanTimelineLogs = Array.isArray(raw?.timelineLogs)
    ? raw.timelineLogs.filter((t) => t && !isSeedRecordId(t.id) && !deletedSet.has(t.id))
    : [];

  const cleanCheckins = Array.isArray(raw?.metabolicCheckins)
    ? raw.metabolicCheckins.filter((c) => c && !deletedSet.has(c.id))
    : [];

  const cleanRoutines = Array.isArray(raw?.workoutRoutines)
    ? raw.workoutRoutines.filter((r) => r && !isSeedRecordId(r.id) && !deletedSet.has(r.id))
    : [];

  const cleanSessions = Array.isArray(raw?.workoutSessions)
    ? raw.workoutSessions.filter((s) => s && !isSeedRecordId(s.id) && !deletedSet.has(s.id))
    : [];

  const customFoods = Array.isArray(raw?.customFoods)
    ? raw.customFoods.filter((f) => f && f.isCustom && !deletedSet.has(f.id))
    : [];

  const favoriteFoodIds = Array.isArray(raw?.favoriteFoodIds)
    ? raw.favoriteFoodIds
    : INITIAL_FOOD_ITEMS.filter((f) => f.isFavorite).map((f) => f.id);

  const customRecipes = Array.isArray(raw?.customRecipes) ? raw.customRecipes : [];

  const customExercises = Array.isArray(raw?.customExercises) ? raw.customExercises : [];

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
    completedNutritionDates: Array.isArray(raw?.completedNutritionDates)
      ? raw.completedNutritionDates.filter(isCivilDate)
      : [],
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
    customExercises: state.exerciseCatalog.filter((e) => !baseExerciseIds.has(e.id)),
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
  void Promise.resolve(
    offlineFirstStorage.setItem(getUserStorageKey(state.activeUserId), JSON.stringify(snapshot)),
  ).catch(reportLocalFailure);
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

  initializeForUser: async (user, _options) => {
    const generation = ++sessionGeneration;
    await purgeLegacyGlobalMockStorage();
    if (generation !== sessionGeneration) return;

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
      const rawJson = await offlineFirstStorage.getItem(getUserStorageKey(user.id));
      if (rawJson) {
        const parsed = snapshotSchema.parse(JSON.parse(rawJson)) as Partial<PersistedUserSnapshot>;
        localSnapshot = sanitizeSnapshot(parsed, user);
      }
    } catch {
      reportLocalFailure();
      throw new Error('Los datos locales no se pudieron validar. Se conservaron sin sobrescribir.');
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
    const mergedExercises = [...localSnapshot.customExercises, ...OPENGYM_EXERCISE_CATALOG];

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
      set({
        userProfile: remote.userProfile,
        biometricLogs: recalculateBiometricTrends(
          remote.biometricLogs,
          remote.userProfile?.ewmaAlpha ?? 0.12,
        ),
        foods: [
          ...remote.customFoods,
          ...INITIAL_FOOD_ITEMS.map((f) => ({ ...f, isFavorite: favorites.has(f.id) })),
        ],
        recipes: [...remote.customRecipes, ...INITIAL_RECIPES],
        exerciseCatalog: [...remote.customExercises, ...OPENGYM_EXERCISE_CATALOG],
        timelineLogs: remote.timelineLogs,
        metabolicCheckins: remote.metabolicCheckins,
        workoutRoutines: remote.workoutRoutines,
        workoutSessions: remote.workoutSessions,
        deletedRecordIds: remote.deletedRecordIds,
        completedNutritionDates: remote.completedNutritionDates ?? [],
      });
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
      const next = typeof updater === 'function' ? updater(state.activeWorkoutDraft) : updater;
      return { activeWorkoutDraft: next };
    });
    persistCurrentUserState(get());
  },

  setRoutineEditorDraft: (updater) => {
    set((state) => {
      const next = typeof updater === 'function' ? updater(state.routineEditorDraft) : updater;
      return { routineEditorDraft: next };
    });
    persistCurrentUserState(get());
  },

  setOnboardingDraft: (updater) => {
    set((state) => {
      const next = typeof updater === 'function' ? updater(state.onboardingDraft) : updater;
      return { onboardingDraft: next };
    });
    persistCurrentUserState(get());
  },

  ...createProfileActions(set, get, persistCurrentUserState),
  ...createNutritionActions(set, get, persistCurrentUserState),
  // ======================================================================
  // ACCIONES FASE 5: GIMNASIO, RUTINAS Y SESIONES
  // ======================================================================

  ...createWorkoutsActions(set, get, persistCurrentUserState),
}));
