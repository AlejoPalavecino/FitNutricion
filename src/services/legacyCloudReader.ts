import { reportCloudFailure } from '../store/useSyncStatusStore';
import { supabase } from './supabaseClient';
import type {
  BiologicalSex,
  BiometricLog,
  FoodItem,
  MetabolicCheckin,
  NutritionalPhase,
  ProgressionRuleType,
  Recipe,
  TimelineLog,
  TrainingExperience,
  UserProfile,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSetType,
} from '../types/nutrition';
import {
  calculateAgeFromBirthDate,
  calculateFoodItemMacros,
  calculateHierarchicalMacros,
  calculateTargetCaloriesForPhase,
  evaluateAnthropometrics,
} from '../lib/metabolism';
import {
  calculateEstimated1RM,
  calculateSessionTonnageKg,
} from '../lib/strengthAnalytics';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(val: string | undefined): boolean {
  return Boolean(val && UUID_REGEX.test(val));
}

export { generateUuid } from '../lib/ids';

export const LEGACY_SEED_ROUTINE_IDS = new Set([
  'routine-push-heavy',
  'routine-pull-hypertrophy',
  'routine-legs-quad-glute',
  'routine-fallback',
]);

export function isSeedRecordId(id: string | undefined | null): boolean {
  if (!id) return false;
  return (
    id.startsWith('bio-seed-') ||
    id.startsWith('tl-seed-') ||
    id.startsWith('ws-seed-') ||
    LEGACY_SEED_ROUTINE_IDS.has(id)
  );
}

export interface HydratedCloudUserData {
  hasRemoteProfile: boolean;
  userProfile: UserProfile | null;
  biometricLogs: BiometricLog[];
  customFoods: FoodItem[];
  timelineLogs: TimelineLog[];
  metabolicCheckins: MetabolicCheckin[];
  workoutRoutines: WorkoutRoutine[];
  workoutSessions: WorkoutSession[];
}

/**
 * Capa de Repositorio y Sincronización en la Nube (Supabase) en 3ª Forma Normal (3FN).
 * Gestiona las tablas normalizadas y las tablas intermedias N:M sin guardar columnas redundantes.
 */
export const legacyCloudReader = {
  /**
   * Descarga y reconstruye desde las tablas 3FN de Supabase los datos reales del usuario autenticado.
   */
  async fetchUserCloudData(
    userId: string,
    foods: FoodItem[],
    recipes: Recipe[]
  ): Promise<HydratedCloudUserData | null> {
    if (!supabase || !isValidUuid(userId)) return null;

    try {

      const [
        profileRes,
        bioRes,
        customFoodsRes,
        tlRes,
        checkinsRes,
        routinesRes,
        sessionsRes,
      ] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('biometric_logs')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: true }),
        supabase
          .from('food_items')
          .select('*')
          .eq('owner_user_id', userId),
        supabase
          .from('timeline_logs')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: true }),
        supabase
          .from('metabolic_checkins')
          .select('*')
          .eq('user_id', userId)
          .order('week_date', { ascending: false }),
        supabase
          .from('workout_routines')
          .select(
            '*, workout_routine_days(day_of_week), workout_routine_exercises(*)'
          )
          .eq('user_id', userId),
        supabase
          .from('workout_sessions')
          .select('*, workout_set_logs(*)')
          .eq('user_id', userId)
          .order('date', { ascending: false }),
      ]);

      const responses = [profileRes, bioRes, customFoodsRes, tlRes, checkinsRes, routinesRes, sessionsRes];
      if (responses.some((response) => response.error)) {
        reportCloudFailure();
        return null;
      }

      const rawProfile = profileRes.data;
      const heightCm = Number(rawProfile?.height_cm ?? 170);

      const biometricLogs: BiometricLog[] = (bioRes.data ?? [])
        .filter((row: Record<string, any>) => !isSeedRecordId(String(row.id ?? '')))
        .map((row: Record<string, any>) => {
          const scaleWeightKg = Number(row.scale_weight_kg);
          const trendWeightKg = Number(row.trend_weight_kg ?? scaleWeightKg);
          const estimatedBfPercent = Number(row.estimated_bf_percent ?? 18);
          const lbmKg = Number(
            (trendWeightKg * (1 - estimatedBfPercent / 100)).toFixed(2)
          );
          const fatMassKg = Number(Math.max(0, trendWeightKg - lbmKg).toFixed(2));
          const waistCm =
            row.waist_cm !== null && row.waist_cm !== undefined
              ? Number(row.waist_cm)
              : undefined;
          const neckCm =
            row.neck_cm !== null && row.neck_cm !== undefined
              ? Number(row.neck_cm)
              : undefined;
          const hipCm =
            row.hip_cm !== null && row.hip_cm !== undefined
              ? Number(row.hip_cm)
              : undefined;
          const whtr =
            waistCm && heightCm > 0
              ? Number((waistCm / heightCm).toFixed(3))
              : undefined;

          return {
            id: String(row.id),
            date: String(row.date),
            scaleWeightKg,
            trendWeightKg,
            neckCm,
            waistCm,
            hipCm,
            estimatedBfPercent,
            bfMethod:
              row.bf_method === 'us_navy' ? 'us_navy' : 'boer_fallback',
            lbmKg,
            fatMassKg,
            whtr,
            sleepHours:
              row.sleep_hours !== null && row.sleep_hours !== undefined
                ? Number(row.sleep_hours)
                : undefined,
            steps:
              row.steps !== null && row.steps !== undefined
                ? Number(row.steps)
                : undefined,
          };
        });

      let userProfile: UserProfile | null = null;
      if (rawProfile && rawProfile.onboarding_completed) {
        const latestBio = biometricLogs[biometricLogs.length - 1];
        const sex: BiologicalSex =
          rawProfile.sex === 'female' ? 'female' : 'male';
        const birthDate = String(rawProfile.birth_date);
        const age = calculateAgeFromBirthDate(birthDate);
        const weightKg = latestBio?.trendWeightKg ?? 70;
        const initialPal = Number(rawProfile.initial_pal ?? 1.55);
        const trainingExperience = (rawProfile.training_experience ??
          'intermediate') as TrainingExperience;
        const currentPhase = (rawProfile.current_phase ??
          'recomp') as NutritionalPhase;
        const phaseAdjustmentPercent = Number(
          rawProfile.phase_adjustment_percent ?? 0
        );
        const activeTdee = Number(rawProfile.active_tdee ?? 2200);

        const diag = evaluateAnthropometrics({
          sex,
          age,
          heightCm,
          weightKg,
          pal: initialPal,
          trainingExperience,
          neckCm: latestBio?.neckCm,
          waistCm: latestBio?.waistCm,
          hipCm: latestBio?.hipCm,
        });

        const phaseCal = calculateTargetCaloriesForPhase({
          activeTdee,
          phase: currentPhase,
          fatMassKg: latestBio?.fatMassKg ?? diag.fatMassKg,
          customAdjustmentPercent: phaseAdjustmentPercent,
        });

        const macros = calculateHierarchicalMacros({
          targetKcal: phaseCal.targetKcal,
          weightKg,
          lbmKg: latestBio?.lbmKg ?? diag.lbmKg,
          bfPercent: latestBio?.estimatedBfPercent ?? diag.bfPercent,
          sex,
          phase: currentPhase,
        });

        userProfile = {
          id: userId,
          name: String(rawProfile.name ?? ''),
          birthDate,
          sex,
          heightCm,
          initialPal,
          trainingExperience,
          returningFromInactivity: Boolean(rawProfile.returning_from_inactivity),
          weeksInCurrentDeficit: Number(rawProfile.weeks_in_current_deficit ?? 0),
          goalPhysiqueReached: Boolean(rawProfile.goal_physique_reached),
          currentPhase,
          phaseAdjustmentPercent,
          activeTdee,
          bmrKcal: diag.bmrKcal,
          bmrFormulaUsed: diag.bmrFormula,
          targetKcal: macros.kcal,
          targetAdjustmentReason: macros.energyAdjustmentReason ?? undefined,
          targetProteinG: macros.proteinG,
          targetCarbsG: macros.carbsG,
          targetFatG: macros.fatG,
          targetFiberG: macros.fiberG,
          targetWaterMl: macros.waterMl,
          ewmaAlpha: Number(rawProfile.ewma_alpha ?? 0.12),
          onboardingCompleted: Boolean(rawProfile.onboarding_completed),
          updatedAt: String(rawProfile.updated_at ?? new Date().toISOString()),
        };
      }

      const customFoods: FoodItem[] = (customFoodsRes.data ?? []).map(
        (row: Record<string, any>) => ({
          id: String(row.id),
          barcode: row.barcode ? String(row.barcode) : undefined,
          name: String(row.name ?? 'Alimento personalizado'),
          brand: row.brand ? String(row.brand) : undefined,
          kcalPer100g: Number(row.kcal_per_100g ?? 0),
          proteinPer100g: Number(row.protein_per_100g ?? 0),
          carbsPer100g: Number(row.carbs_per_100g ?? 0),
          fatPer100g: Number(row.fat_per_100g ?? 0),
          fiberPer100g: Number(row.fiber_per_100g ?? 0),
          defaultServingName: String(row.default_serving_name ?? 'Porción'),
          defaultServingGrams: Number(row.default_serving_grams ?? 100),
          isCustom: true,
          isFavorite: Boolean(row.is_favorite),
          isBridgeFood: Boolean(row.is_bridge_food),
        })
      );

      const foodMap = new Map(
        [...customFoods, ...foods].map((f) => [f.id, f])
      );
      const recipeMap = new Map(recipes.map((r) => [r.id, r]));

      const timelineLogs: TimelineLog[] = (tlRes.data ?? [])
        .filter((row: Record<string, any>) => !isSeedRecordId(String(row.id ?? '')))
        .map((row: Record<string, any>) => {
          const gramsConsumed = Number(row.grams_consumed ?? 100);
          const foodId = row.food_id ? String(row.food_id) : undefined;
          const recipeId = row.recipe_id ? String(row.recipe_id) : undefined;
          let calculatedMacros = {
            kcal: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            fiberG: 0,
          };

          if (foodId && foodMap.has(foodId)) {
            calculatedMacros = calculateFoodItemMacros(
              foodMap.get(foodId)!,
              gramsConsumed
            );
          } else if (recipeId && recipeMap.has(recipeId)) {
            const recipe = recipeMap.get(recipeId)!;
            const ratio =
              gramsConsumed / Math.max(1, recipe.totalMacros.totalGrams);
            calculatedMacros = {
              kcal: Math.round(recipe.totalMacros.kcal * ratio),
              proteinG: Number(
                (recipe.totalMacros.proteinG * ratio).toFixed(1)
              ),
              carbsG: Number((recipe.totalMacros.carbsG * ratio).toFixed(1)),
              fatG: Number((recipe.totalMacros.fatG * ratio).toFixed(1)),
              fiberG: Number((recipe.totalMacros.fiberG * ratio).toFixed(1)),
            };
          }

          return {
            id: String(row.id),
            date: String(row.date),
            hour: Number(row.hour ?? 12),
            foodId,
            recipeId,
            customLabel: row.custom_label ? String(row.custom_label) : undefined,
            gramsConsumed,
            calculatedMacros,
          };
        });

      const metabolicCheckins: MetabolicCheckin[] = (
        checkinsRes.data ?? []
      ).map((row: Record<string, any>) => ({
        id: String(row.id),
        weekDate: String(row.week_date),
        avgDailyIntakeKcal: Number(row.avg_daily_intake_kcal ?? 0),
        weightSlopeKgPerWeek: Number(row.weight_slope_kg_per_week ?? 0),
        calculatedRealTdee: Number(row.calculated_real_tdee ?? 0),
        previousTdee: Number(row.previous_tdee ?? 0),
        appliedTdee: Number(row.applied_tdee ?? 0),
        userApproved: Boolean(row.user_approved),
        loggedDaysInWindow:
          row.logged_days_in_window !== null &&
          row.logged_days_in_window !== undefined
            ? Number(row.logged_days_in_window)
            : undefined,
        imputedDaysInWindow:
          row.imputed_days_in_window !== null &&
          row.imputed_days_in_window !== undefined
            ? Number(row.imputed_days_in_window)
            : undefined,
      }));

      const workoutRoutines: WorkoutRoutine[] = (routinesRes.data ?? [])
        .filter(
          (row: Record<string, any>) => !isSeedRecordId(String(row.id ?? ''))
        )
        .map((row: Record<string, any>) => {
          const rawDays = Array.isArray(row.workout_routine_days)
            ? row.workout_routine_days
            : [];
          const rawExercises = Array.isArray(row.workout_routine_exercises)
            ? row.workout_routine_exercises
            : [];

          return {
            id: String(row.id),
            name: String(row.name),
            assignedDays: rawDays
              .map((d: Record<string, any>) => Number(d.day_of_week))
              .sort((a: number, b: number) => a - b),
            exercises: [...rawExercises]
              .sort(
                (a: Record<string, any>, b: Record<string, any>) =>
                  Number(a.exercise_order) - Number(b.exercise_order)
              )
              .map((ex: Record<string, any>, idx: number) => ({
                exerciseId: String(ex.exercise_id),
                order: Number(ex.exercise_order ?? idx + 1),
                supersetGroupId: ex.superset_group
                  ? String(ex.superset_group)
                  : undefined,
                targetSets: Number(ex.target_sets ?? 3),
                targetRepRange: [
                  Number(ex.min_reps ?? 8),
                  Number(ex.max_reps ?? 12),
                ] as [number, number],
                targetRir: Number(ex.target_rir ?? 1),
                restSeconds: Number(ex.rest_seconds ?? 120),
                progressionRule: (ex.progression_rule ??
                  'double_progression') as ProgressionRuleType,
                notes: ex.notes ? String(ex.notes) : undefined,
              })),
          };
        });

      const routineNameMap = new Map(
        workoutRoutines.map((r) => [r.id, r.name])
      );

      const workoutSessions: WorkoutSession[] = (sessionsRes.data ?? [])
        .filter(
          (row: Record<string, any>) => !isSeedRecordId(String(row.id ?? ''))
        )
        .map((row: Record<string, any>) => {
          const rawSets = Array.isArray(row.workout_set_logs)
            ? row.workout_set_logs
            : [];
          const sets = [...rawSets]
            .sort(
              (a: Record<string, any>, b: Record<string, any>) =>
                Number(a.set_number) - Number(b.set_number)
            )
            .map((s: Record<string, any>) => {
              const weightKg = Number(s.weight_kg ?? 0);
              const reps = Number(s.reps ?? 0);
              const setType = (s.set_type ?? 'working') as WorkoutSetType;
              return {
                id: String(s.id),
                exerciseId: String(s.exercise_id),
                setNumber: Number(s.set_number ?? 1),
                setType,
                weightKg,
                reps,
                rir:
                  s.rir !== null && s.rir !== undefined
                    ? Number(s.rir)
                    : undefined,
                isCompleted: Boolean(s.is_completed),
                isPrWeight: Boolean(s.is_pr_weight),
                isPr1RM: Boolean(s.is_pr_1rm),
                estimated1RM: calculateEstimated1RM(weightKg, reps, setType),
              };
            });

          const routineId = row.routine_id ? String(row.routine_id) : undefined;
          return {
            id: String(row.id),
            routineId,
            routineName:
              (routineId && routineNameMap.get(routineId)) ||
              'Sesión de Fuerza',
            date: String(row.date),
            startTime: String(row.start_time ?? '18:00'),
            endTime: String(row.end_time ?? '19:00'),
            durationMinutes: Number(row.duration_minutes ?? 45),
            bodyweightKgAtSession: Number(row.bodyweight_kg_at_session ?? 70),
            totalVolumeKg: calculateSessionTonnageKg(sets),
            sets,
          };
        });

      return {
        hasRemoteProfile: Boolean(userProfile),
        userProfile,
        biometricLogs,
        customFoods,
        timelineLogs,
        metabolicCheckins,
        workoutRoutines,
        workoutSessions,
      };
    } catch {
      reportCloudFailure();
      return null;
    }
  },

};
