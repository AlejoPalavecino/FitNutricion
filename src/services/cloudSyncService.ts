import { supabase } from './supabaseClient';
import type {
  BiologicalSex,
  BiometricLog,
  NutritionalPhase,
  TimelineLog,
  UserProfile,
  WorkoutRoutine,
  WorkoutSession,
} from '../types/nutrition';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(val: string | undefined): boolean {
  return Boolean(val && UUID_REGEX.test(val));
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
};
