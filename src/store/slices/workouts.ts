import {
  calculateEstimated1RM,
  calculateSessionTonnageKg,
  getHistoricalExerciseBest,
} from '../../lib/strengthAnalytics';
import { generateUuid } from '../../services/cloudSyncService';
import type { ExerciseCatalogItem, WorkoutSession } from '../../types/nutrition';

import type { StoreApi } from 'zustand';
import { localDate as getTodayIso } from '../../lib/dates';
import type { NutritionState } from '../useNutritionStore';

export function createWorkoutsActions(
  set: StoreApi<NutritionState>['setState'],
  get: StoreApi<NutritionState>['getState'],
  persistCurrentUserState: (state: NutritionState) => void,
): Pick<
  NutritionState,
  | 'saveWorkoutRoutine'
  | 'addExerciseToRoutine'
  | 'deleteWorkoutRoutine'
  | 'logWorkoutSession'
  | 'deleteWorkoutSession'
  | 'addCustomExerciseCatalogItem'
> {
  return {
    saveWorkoutRoutine: (routine) => {
      set((state) => {
        const exists = state.workoutRoutines.some((r) => r.id === routine.id);
        const nextRoutines = exists
          ? state.workoutRoutines.map((r) => (r.id === routine.id ? routine : r))
          : [...state.workoutRoutines, routine];
        return {
          workoutRoutines: nextRoutines,
          routineEditorDraft: routine,
          deletedRecordIds: state.deletedRecordIds.filter((id) => id !== routine.id),
        };
      });
      persistCurrentUserState(get());
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
        const updatedTarget = updatedRoutines.find((r) => r.id === routineId) ?? null;
        return {
          workoutRoutines: updatedRoutines,
          routineEditorDraft:
            state.routineEditorDraft?.id === routineId && updatedTarget
              ? updatedTarget
              : state.routineEditorDraft,
        };
      });
      persistCurrentUserState(get());
    },

    deleteWorkoutRoutine: (routineId) => {
      const state = get();
      const remaining = state.workoutRoutines.filter((r) => r.id !== routineId);
      set({
        workoutRoutines: remaining,
        activeWorkoutDraft:
          state.activeWorkoutDraft?.routineId === routineId ? null : state.activeWorkoutDraft,
        routineEditorDraft:
          state.routineEditorDraft?.id === routineId
            ? (remaining[0] ?? null)
            : state.routineEditorDraft,
        deletedRecordIds: Array.from(new Set([...state.deletedRecordIds, routineId])),
      });
      persistCurrentUserState(get());
    },

    logWorkoutSession: (payload) => {
      const state = get();
      const sessionDate = payload.date || getTodayIso();

      // Tomar automáticamente bodyweightKgAtSession del BiometricLog del día o del más reciente del usuario
      const exactDayBio = state.biometricLogs.find((b) => b.date === sessionDate);
      const sortedBio = [...state.biometricLogs].sort((a, b) => a.date.localeCompare(b.date));
      const fallbackBio = sortedBio[sortedBio.length - 1];
      const bodyweightKgAtSession = exactDayBio?.scaleWeightKg ?? fallbackBio?.scaleWeightKg ?? 70;

      // Recalcular PRs y 1RM para todas las series efectivas completadas
      const processedSets = payload.sets.map((s) => {
        const estimated1RM = calculateEstimated1RM(s.weightKg, s.reps, s.setType);
        const bestPrev = getHistoricalExerciseBest(s.exerciseId, state.workoutSessions);
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
        deletedRecordIds: Array.from(new Set([...state.deletedRecordIds, sessionId])),
      });
      persistCurrentUserState(get());
    },

    addCustomExerciseCatalogItem: (item) => {
      const newItem: ExerciseCatalogItem = {
        ...item,
        id: `og-custom-${generateUuid()}`,
      };
      set((state) => ({
        exerciseCatalog: [newItem, ...state.exerciseCatalog],
      }));
      persistCurrentUserState(get());
      return newItem;
    },
  };
}
