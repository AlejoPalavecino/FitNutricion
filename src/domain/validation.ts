import { z } from 'zod';
import { isCivilDate } from '../lib/dates';
import type { EntityKind } from '../services/sync/engine';
const id = z.string().min(1).max(200),
  number = z.number().finite(),
  nonnegative = number.nonnegative();
const date = z.string().refine(isCivilDate),
  strings = z.array(id).max(10000);
const macros = z
  .object({
    kcal: nonnegative,
    proteinG: nonnegative,
    carbsG: nonnegative,
    fatG: nonnegative,
    fiberG: nonnegative,
  })
  .passthrough();
const set = z
  .object({
    id,
    exerciseId: id,
    setNumber: number.int().positive(),
    setType: z.enum(['warmup', 'working', 'dropset', 'failure']),
    weightKg: nonnegative,
    reps: nonnegative.int(),
    isCompleted: z.boolean(),
    estimated1RM: nonnegative,
  })
  .passthrough();
const schemas = {
  profile: z
    .object({
      id,
      name: z.string(),
      birthDate: date,
      sex: z.enum(['male', 'female']),
      heightCm: number.positive(),
      initialPal: number.positive(),
      trainingExperience: z.enum(['novice', 'intermediate', 'advanced']),
      currentPhase: z.enum(['cut', 'recomp', 'maintenance', 'bulk']),
      activeTdee: number.positive(),
      targetKcal: number.positive(),
      targetProteinG: nonnegative,
      targetCarbsG: nonnegative,
      targetFatG: nonnegative,
      phaseAdjustmentPercent: number,
      bmrKcal: number.positive(),
      bmrFormulaUsed: z.enum(['katch_mcardle', 'mifflin_st_jeor']),
      targetFiberG: nonnegative,
      targetWaterMl: nonnegative,
      ewmaAlpha: number.min(0.1).max(0.15),
      onboardingCompleted: z.boolean(),
      updatedAt: z.string(),
    })
    .passthrough(),
  biometric: z
    .object({
      id,
      date,
      scaleWeightKg: number.positive(),
      trendWeightKg: number.positive(),
      estimatedBfPercent: nonnegative,
      bfMethod: z.enum(['us_navy', 'boer_fallback']),
      lbmKg: nonnegative,
      fatMassKg: nonnegative,
    })
    .passthrough(),
  food: z
    .object({
      id,
      name: z.string(),
      kcalPer100g: nonnegative,
      proteinPer100g: nonnegative,
      carbsPer100g: nonnegative,
      fatPer100g: nonnegative,
      fiberPer100g: nonnegative,
      isCustom: z.boolean(),
      isFavorite: z.boolean(),
      defaultServingName: z.string(),
      defaultServingGrams: number.positive(),
    })
    .passthrough(),
  recipe: z
    .object({
      id,
      name: z.string(),
      description: z.string(),
      instructions: z.array(z.string()),
      tags: z.array(z.string()),
      ingredients: z.array(z.object({ foodId: id, grams: number.positive() })).max(500),
      totalMacros: macros.extend({ totalGrams: number.positive() }),
    })
    .passthrough(),
  exercise: z
    .object({
      id,
      nameEs: z.string(),
      nameEn: z.string(),
      aliases: strings,
      primaryMuscle: z.string(),
      secondaryMuscles: strings,
      equipment: z.string(),
      category: z.string(),
      images: z.array(z.string()).max(30),
      instructionsEs: z.array(z.string()).max(100),
    })
    .passthrough(),
  timeline: z
    .object({
      id,
      date,
      hour: number.int().min(0).max(23),
      gramsConsumed: number.positive(),
      calculatedMacros: macros,
    })
    .passthrough(),
  checkin: z
    .object({
      id,
      weekDate: date,
      avgDailyIntakeKcal: nonnegative,
      weightSlopeKgPerWeek: number,
      calculatedRealTdee: number.positive(),
      previousTdee: number.positive(),
      appliedTdee: number.positive(),
      userApproved: z.boolean(),
    })
    .passthrough(),
  routine: z
    .object({
      id,
      name: z.string(),
      assignedDays: z.array(number.int().min(0).max(6)).max(7),
      exercises: z
        .array(
          z
            .object({
              exerciseId: id,
              order: number.int().positive(),
              targetSets: number.int().positive(),
              targetRepRange: z.tuple([number.int().positive(), number.int().positive()]),
              targetRir: nonnegative,
              restSeconds: nonnegative,
              progressionRule: z.string(),
            })
            .passthrough(),
        )
        .max(500),
    })
    .passthrough(),
  session: z
    .object({
      id,
      date,
      routineName: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      durationMinutes: nonnegative,
      bodyweightKgAtSession: number.positive(),
      totalVolumeKg: nonnegative,
      sets: z.array(set).max(5000),
    })
    .passthrough(),
  preferences: z
    .object({
      favoriteFoodIds: strings,
      completedNutritionDates: z.array(date).max(100000).optional(),
    })
    .passthrough(),
};
export function parseEntity(kind: EntityKind, value: unknown): Record<string, unknown> | null {
  return value === null ? null : schemas[kind].parse(value);
}
/** Validate persisted data before hydration. Invalid data remains on disk for recovery. */
export const snapshotSchema = z
  .object({
    userProfile: schemas.profile.nullable().optional(),
    biometricLogs: z.array(schemas.biometric).optional(),
    customFoods: z.array(schemas.food).optional(),
    customRecipes: z.array(schemas.recipe).optional(),
    customExercises: z.array(schemas.exercise).optional(),
    timelineLogs: z.array(schemas.timeline).optional(),
    metabolicCheckins: z.array(schemas.checkin).optional(),
    workoutRoutines: z.array(schemas.routine).optional(),
    workoutSessions: z.array(schemas.session).optional(),
    favoriteFoodIds: strings.optional(),
    deletedRecordIds: strings.optional(),
    completedNutritionDates: z.array(date).optional(),
    activeWorkoutDraft: z
      .object({
        routineId: id,
        startedAtIso: z.string(),
        setsByExercise: z.record(z.string(), z.array(set)),
        restTimerEndsAtMs: nonnegative.nullable(),
        restTimerTotalSeconds: nonnegative,
        restTimerExerciseName: z.string(),
        updatedAt: z.string(),
      })
      .passthrough()
      .nullable()
      .optional(),
    routineEditorDraft: schemas.routine.nullable().optional(),
    onboardingDraft: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
