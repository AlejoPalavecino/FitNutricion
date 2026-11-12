import { addDays, isCivilDate, weekStart } from '../../lib/dates';
import {
  calculateAdaptiveTdee,
  calculateAgeFromBirthDate,
  calculateHierarchicalMacros,
  calculateTargetCaloriesForPhase,
  evaluateAnthropometrics,
  recalculateBiometricTrends,
} from '../../lib/metabolism';
import { generateUuid, isSeedRecordId } from '../../services/cloudSyncService';
import type { BiometricLog, MetabolicCheckin, UserProfile } from '../../types/nutrition';

import type { StoreApi } from 'zustand';
import { localDate as getTodayIso } from '../../lib/dates';
import type { NutritionState } from '../useNutritionStore';

export function createProfileActions(
  set: StoreApi<NutritionState>['setState'],
  get: StoreApi<NutritionState>['getState'],
  persistCurrentUserState: (state: NutritionState) => void,
): Pick<
  NutritionState,
  | 'completeOnboarding'
  | 'updatePhaseAndMacros'
  | 'updateEwmaAlpha'
  | 'addOrUpdateBiometricLog'
  | 'computeCurrentAdaptiveTdeeStatus'
  | 'executeWeeklyMetabolicCheckin'
  | 'resetStoreToOnboarding'
> {
  return {
    completeOnboarding: (payload) => {
      const state = get();
      const age = calculateAgeFromBirthDate(payload.birthDate);
      if (age < 18 || age > 100)
        throw new RangeError('El plan automático está limitado a personas adultas.');
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
      const cleanName = payload.name?.trim() || state.activeUserFullName || 'Usuario';

      const newProfile: UserProfile = {
        id: state.activeUserId ?? `user-${generateUuid()}`,
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
        (b) => !isSeedRecordId(b.id) && b.date !== today,
      );
      const updatedBioLogs = recalculateBiometricTrends(
        [...existingRealLogs, initialBioLog],
        alpha,
      );

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
      const recalculated = recalculateBiometricTrends(state.biometricLogs, safeAlpha);
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
      if (
        !isCivilDate(targetDate) ||
        targetDate > getTodayIso() ||
        !Number.isFinite(payload.scaleWeightKg) ||
        payload.scaleWeightKg < 30 ||
        payload.scaleWeightKg > 250
      )
        throw new RangeError('Pesaje inválido.');
      const age = calculateAgeFromBirthDate(profile.birthDate, targetDate);

      const sortedExisting = [...state.biometricLogs].sort((a, b) => a.date.localeCompare(b.date));
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

      const existingForDate = state.biometricLogs.find((b) => b.date === targetDate);

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
      const recalculated = recalculateBiometricTrends([...filtered, newEntry], profile.ewmaAlpha);

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

      const sortedBio = [...state.biometricLogs].sort((a, b) => a.date.localeCompare(b.date));
      const anchorDateStr = getTodayIso();
      const recentDates = Array.from({ length: 21 }, (_, i) => addDays(anchorDateStr, i - 20));

      const dailyIntakes = recentDates.map((date) => {
        const logsForDay = state.timelineLogs.filter((l) => l.date === date);
        if (logsForDay.length === 0) {
          return { date, kcal: null };
        }
        const totalKcal = logsForDay.reduce((sum, item) => sum + item.calculatedMacros.kcal, 0);
        return {
          date,
          kcal: totalKcal > 0 ? totalKcal : null,
          isComplete: state.completedNutritionDates.includes(date),
        };
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
      const existing = state.metabolicCheckins.find((c) => weekStart(c.weekDate) === period);
      if (existing) return existing;
      const checkin: MetabolicCheckin = {
        id: `checkin-${period}`,
        weekDate: period,
        avgDailyIntakeKcal: adaptiveStatus.avgDailyIntakeKcal,
        weightSlopeKgPerWeek: adaptiveStatus.weightSlopeKgPerWeek,
        calculatedRealTdee: adaptiveStatus.calculatedRealTdee,
        previousTdee: adaptiveStatus.previousTdee,
        appliedTdee: approveAdjustment ? adaptiveStatus.appliedTdee : adaptiveStatus.previousTdee,
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
  };
}
