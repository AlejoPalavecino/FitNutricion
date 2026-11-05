import { supabase } from './supabaseClient';
import type {
  BiologicalSex,
  BiometricLog,
  FoodItem,
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

function isValidUuid(val: string | undefined): boolean {
  return Boolean(val && UUID_REGEX.test(val));
}

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
  timelineLogs: TimelineLog[];
  workoutRoutines: WorkoutRoutine[];
  workoutSessions: WorkoutSession[];
}

/**
 * Capa de Repositorio y Sincronización en la Nube (Supabase) en 3ª Forma Normal (3FN).
 * Gestiona las tablas normalizadas y las tablas intermedias N:M sin guardar columnas redundantes.
 */
export const cloudSyncService = {
  /**
   * Invoca la regla de negocio en el servidor (RPC) para calcular metas diarias.
   */
  async computeDailyTargetsRemotely(params: {
    sex: BiologicalSex;
    weightKg: number;
    heightCm: number;
    age: number;
    activityFactor: number;
    goalPhase: NutritionalPhase;
  }): Promise<{
    activeTdee: number;
    targetKcal: number;
    targetProteinG: number;
    targetCarbsG: number;
    targetFatG: number;
    targetFiberG: number;
    targetWaterMl: number;
  } | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.rpc('rpc_compute_daily_targets', {
        p_sex: params.sex,
        p_weight_kg: params.weightKg,
        p_height_cm: params.heightCm,
        p_age: params.age,
        p_activity_factor: params.activityFactor,
        p_goal_phase: params.goalPhase,
      });
      if (error || !data) return null;
      return data as {
        activeTdee: number;
        targetKcal: number;
        targetProteinG: number;
        targetCarbsG: number;
        targetFatG: number;
        targetFiberG: number;
        targetWaterMl: number;
      };
    } catch {
      return null;
    }
  },

  /**
   * Limpia cualquier registro semilla o de prueba antiguo asociado al usuario en la nube.
   */
  async purgeCloudSeedData(userId: string): Promise<void> {
    if (!supabase || !isValidUuid(userId)) return;
    try {
      await supabase
        .from('workout_sessions')
        .delete()
        .eq('user_id', userId)
        .like('id', 'ws-seed-%');

      await supabase
        .from('workout_routines')
        .delete()
        .eq('user_id', userId)
        .in('id', Array.from(LEGACY_SEED_ROUTINE_IDS));
    } catch {
      // Ignorar si no hay conexión
    }
  },

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
      await this.purgeCloudSeedData(userId);

      const [profileRes, bioRes, tlRes, routinesRes, sessionsRes] =
        await Promise.all([
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
            .from('timeline_logs')
            .select('*')
            .eq('user_id', userId)
            .order('date', { ascending: true }),
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
          targetKcal: phaseCal.targetKcal,
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

      const foodMap = new Map(foods.map((f) => [f.id, f]));
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
        timelineLogs,
        workoutRoutines,
        workoutSessions,
      };
    } catch {
      return null;
    }
  },

  /**
   * Sincroniza `user_profiles` (3FN: solo atributos propios del perfil, sin columnas derivadas).
   */
  async upsertUserProfile(userId: string, profile: UserProfile): Promise<void> {
    if (!supabase || !isValidUuid(userId)) return;
    try {
      await supabase.from('user_profiles').upsert(
        {
          id: userId,
          name: profile.name,
          birth_date: profile.birthDate,
          sex: profile.sex,
          height_cm: profile.heightCm,
          initial_pal: profile.initialPal,
          training_experience: profile.trainingExperience,
          returning_from_inactivity: profile.returningFromInactivity,
          weeks_in_current_deficit: profile.weeksInCurrentDeficit,
          goal_physique_reached: profile.goalPhysiqueReached,
          current_phase: profile.currentPhase,
          phase_adjustment_percent: profile.phaseAdjustmentPercent,
          active_tdee: profile.activeTdee,
          ewma_alpha: profile.ewmaAlpha,
          onboarding_completed: profile.onboardingCompleted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } catch {
      // Mantiene copia local si no hay conexión
    }
  },

  /**
   * Sincroniza `biometric_logs` (3FN: sin `lbm_kg`, `fat_mass_kg` ni `whtr` redundantes).
   */
  async upsertBiometricLog(userId: string, log: BiometricLog): Promise<void> {
    if (!supabase || !isValidUuid(userId)) return;
    try {
      const payload: Record<string, unknown> = {
        user_id: userId,
        date: log.date,
        scale_weight_kg: log.scaleWeightKg,
        trend_weight_kg: log.trendWeightKg,
        neck_cm: log.neckCm ?? null,
        waist_cm: log.waistCm ?? null,
        hip_cm: log.hipCm ?? null,
        estimated_bf_percent: log.estimatedBfPercent,
        bf_method: log.bfMethod,
        sleep_hours: log.sleepHours ?? null,
        steps: log.steps ?? null,
      };
      if (isValidUuid(log.id)) {
        payload.id = log.id;
      }

      await supabase
        .from('biometric_logs')
        .upsert(payload, { onConflict: 'user_id,date' });
    } catch {
      // Mantiene copia local
    }
  },

  /**
   * Sincroniza `timeline_logs` (3FN: solo `food_id`/`recipe_id` y `grams_consumed`, sin `calculated_macros`).
   */
  async insertTimelineLog(userId: string, log: TimelineLog): Promise<void> {
    if (!supabase || !isValidUuid(userId)) return;
    try {
      const payload: Record<string, unknown> = {
        user_id: userId,
        date: log.date,
        hour: log.hour,
        food_id: log.foodId ?? null,
        recipe_id: log.recipeId ?? null,
        custom_label: log.customLabel ?? null,
        grams_consumed: log.gramsConsumed,
      };
      if (isValidUuid(log.id)) {
        payload.id = log.id;
      }

      await supabase.from('timeline_logs').insert(payload);
    } catch {
      // Mantiene copia local
    }
  },

  /**
   * Elimina un registro de `timeline_logs`.
   */
  async deleteTimelineLog(userId: string, logId: string): Promise<void> {
    if (!supabase || !isValidUuid(userId) || !isValidUuid(logId)) return;
    try {
      await supabase
        .from('timeline_logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);
    } catch {
      // Ignorar si es local
    }
  },

  /**
   * Sincroniza una rutina en 3FN poblando la cabecera (`workout_routines`)
   * y las dos tablas intermedias N:M (`workout_routine_days` y `workout_routine_exercises`).
   */
  async upsertWorkoutRoutine(
    userId: string,
    routine: WorkoutRoutine
  ): Promise<void> {
    if (!supabase || !isValidUuid(userId)) return;
    try {
      const { error: headerErr } = await supabase.from('workout_routines').upsert(
        {
          id: routine.id,
          user_id: userId,
          name: routine.name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (headerErr) return;

      await supabase
        .from('workout_routine_days')
        .delete()
        .eq('routine_id', routine.id);

      if (routine.assignedDays.length > 0) {
        await supabase.from('workout_routine_days').insert(
          routine.assignedDays.map((day) => ({
            routine_id: routine.id,
            day_of_week: day,
          }))
        );
      }

      await supabase
        .from('workout_routine_exercises')
        .delete()
        .eq('routine_id', routine.id);

      if (routine.exercises.length > 0) {
        await supabase.from('workout_routine_exercises').insert(
          routine.exercises.map((ex, idx) => ({
            routine_id: routine.id,
            exercise_id: ex.exerciseId,
            exercise_order: idx + 1,
            target_sets: ex.targetSets,
            min_reps: ex.targetRepRange[0],
            max_reps: ex.targetRepRange[1],
            target_rir: ex.targetRir,
            rest_seconds: ex.restSeconds,
            progression_rule: ex.progressionRule,
            superset_group: ex.supersetGroupId ?? null,
            notes: ex.notes ?? null,
          }))
        );
      }
    } catch {
      // Mantiene copia local
    }
  },

  /**
   * Elimina una rutina del usuario en Supabase.
   */
  async deleteWorkoutRoutine(
    userId: string,
    routineId: string
  ): Promise<void> {
    if (!supabase || !isValidUuid(userId)) return;
    try {
      await supabase
        .from('workout_routines')
        .delete()
        .eq('id', routineId)
        .eq('user_id', userId);
    } catch {
      // Ignorar si es local
    }
  },

  /**
   * Sincroniza `workout_sessions` y `workout_set_logs` en 3FN
   * (sin `routine_name`, `total_volume_kg` ni `estimated_1rm` redundantes).
   */
  async insertWorkoutSession(
    userId: string,
    session: WorkoutSession
  ): Promise<void> {
    if (!supabase || !isValidUuid(userId)) return;
    try {
      const { error: sessErr } = await supabase.from('workout_sessions').insert({
        id: session.id,
        user_id: userId,
        routine_id: session.routineId ?? null,
        date: session.date,
        start_time: session.startTime,
        end_time: session.endTime,
        duration_minutes: session.durationMinutes,
        bodyweight_kg_at_session: session.bodyweightKgAtSession,
      });

      if (!sessErr && session.sets.length > 0) {
        await supabase.from('workout_set_logs').insert(
          session.sets.map((s) => ({
            id: s.id,
            session_id: session.id,
            exercise_id: s.exerciseId,
            set_number: s.setNumber,
            set_type: s.setType,
            weight_kg: s.weightKg,
            reps: s.reps,
            rir: s.rir ?? null,
            is_completed: s.isCompleted,
            is_pr_weight: s.isPrWeight,
            is_pr_1rm: s.isPr1RM,
          }))
        );
      }
    } catch {
      // Mantiene copia local
    }
  },

  /**
   * Elimina una sesión de entrenamiento en Supabase.
   */
  async deleteWorkoutSession(
    userId: string,
    sessionId: string
  ): Promise<void> {
    if (!supabase || !isValidUuid(userId)) return;
    try {
      await supabase
        .from('workout_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', userId);
    } catch {
      // Ignorar si es local
    }
  },
};
