import { isCivilDate } from '../../lib/dates';
import { calculateFoodItemMacros } from '../../lib/metabolism';
import { generateUuid } from '../../services/cloudSyncService';
import type { FoodItem, MacroBreakdown, Recipe, TimelineLog } from '../../types/nutrition';

import type { StoreApi } from 'zustand';
import { localDate as getTodayIso } from '../../lib/dates';
import type { NutritionState } from '../useNutritionStore';

export function createNutritionActions(
  set: StoreApi<NutritionState>['setState'],
  get: StoreApi<NutritionState>['getState'],
  persistCurrentUserState: (state: NutritionState) => void,
): Pick<
  NutritionState,
  | 'setSelectedDate'
  | 'markNutritionDayComplete'
  | 'addTimelineLog'
  | 'updateTimelineLogGrams'
  | 'removeTimelineLog'
  | 'multiPasteTimelineLogs'
  | 'addCustomFood'
  | 'toggleFavoriteFood'
  | 'addCustomRecipe'
> {
  return {
    setSelectedDate: (date) => {
      if (isCivilDate(date)) set({ selectedDate: date });
    },
    markNutritionDayComplete: (date, complete) => {
      const state = get();
      if (
        !isCivilDate(date) ||
        date > getTodayIso() ||
        !state.timelineLogs.some((l) => l.date === date)
      )
        return;
      set({
        completedNutritionDates: complete
          ? Array.from(new Set([...state.completedNutritionDates, date]))
          : state.completedNutritionDates.filter((d) => d !== date),
      });
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

      const matchedFood = foodId ? state.foods.find((f) => f.id === foodId) : undefined;

      if (!overrideMacros && matchedFood) {
        calculatedMacros = calculateFoodItemMacros(matchedFood, gramsConsumed);
      } else if (!overrideMacros && recipeId) {
        const recipe = state.recipes.find((r) => r.id === recipeId);
        if (recipe) {
          const ratio = gramsConsumed / Math.max(1, recipe.totalMacros.totalGrams);
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
        completedNutritionDates: state.completedNutritionDates.filter((d) => d !== targetDate),
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
      set({
        timelineLogs: updated,
        completedNutritionDates: state.completedNutritionDates.filter(
          (d) => d !== state.timelineLogs.find((l) => l.id === logId)?.date,
        ),
      });
      persistCurrentUserState(get());
    },

    removeTimelineLog: (logId) => {
      const state = get();
      set({
        timelineLogs: state.timelineLogs.filter((l) => l.id !== logId),
        completedNutritionDates: state.completedNutritionDates.filter(
          (d) => d !== state.timelineLogs.find((l) => l.id === logId)?.date,
        ),
        deletedRecordIds: Array.from(new Set([...state.deletedRecordIds, logId])),
      });
      persistCurrentUserState(get());
    },

    multiPasteTimelineLogs: (logIds, targetDates) => {
      const state = get();
      const selectedLogs = state.timelineLogs.filter((l) => logIds.includes(l.id));
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
        completedNutritionDates: state.completedNutritionDates.filter(
          (d) => !targetDates.includes(d),
        ),
      });
      persistCurrentUserState(get());
    },

    addCustomFood: (foodData) => {
      const providedId = (foodData as Partial<FoodItem>).id;
      const newFood: FoodItem = {
        ...foodData,
        id: providedId || `food-custom-${generateUuid()}`,
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
        foods: state.foods.map((f) => (f.id === foodId ? { ...f, isFavorite: !f.isFavorite } : f)),
      }));
      persistCurrentUserState(get());
    },

    addCustomRecipe: (recipeData) => {
      const newRecipe: Recipe = {
        ...recipeData,
        id: `recipe-custom-${generateUuid()}`,
      };
      set((state) => ({
        recipes: [newRecipe, ...state.recipes],
      }));
      persistCurrentUserState(get());
    },
  };
}
