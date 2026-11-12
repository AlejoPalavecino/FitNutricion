export type BiologicalSex = 'male' | 'female';

export type TrainingExperience = 'novice' | 'intermediate' | 'advanced';

export type NutritionalPhase = 'cut' | 'recomp' | 'maintenance' | 'bulk';

export type BodyFatMethod = 'us_navy' | 'boer_fallback';

export type BmrFormula = 'katch_mcardle' | 'mifflin_st_jeor';

export interface MacroBreakdown {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface UserProfile {
  id: string;
  name?: string;
  birthDate: string; // YYYY-MM-DD
  sex: BiologicalSex;
  heightCm: number;
  initialPal: number; // 1.2 - 1.9
  trainingExperience: TrainingExperience;
  returningFromInactivity?: boolean;
  weeksInCurrentDeficit?: number;
  goalPhysiqueReached?: boolean;
  currentPhase: NutritionalPhase;
  phaseAdjustmentPercent: number; // e.g., -0.20, -0.125, 0, +0.12
  activeTdee: number;
  bmrKcal: number;
  bmrFormulaUsed: BmrFormula;
  targetKcal: number;
  targetAdjustmentReason?: string;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  targetFiberG: number;
  targetWaterMl: number;
  ewmaAlpha: number; // 0.10 to 0.15 (default 0.12)
  onboardingCompleted: boolean;
  updatedAt: string;
}

export interface BiometricLog {
  id: string;
  date: string; // YYYY-MM-DD
  scaleWeightKg: number;
  trendWeightKg: number;
  neckCm?: number;
  waistCm?: number;
  hipCm?: number;
  estimatedBfPercent: number;
  bfMethod: BodyFatMethod;
  lbmKg: number;
  fatMassKg: number;
  whtr?: number;
  sleepHours?: number;
  steps?: number;
}

export interface FoodItem {
  id: string;
  barcode?: string;
  name: string;
  brand?: string;
  category?: 'protein' | 'carb' | 'fat' | 'dairy' | 'fruit_veg' | 'mixed';
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  defaultServingName: string;
  defaultServingGrams: number;
  isCustom: boolean;
  isFavorite: boolean;
  isBridgeFood?: boolean;
}

export interface TimelineLog {
  id: string;
  date: string; // YYYY-MM-DD
  hour: number; // 0 - 23
  foodId?: string;
  recipeId?: string;
  customLabel?: string;
  gramsConsumed: number;
  calculatedMacros: MacroBreakdown;
}

export type RecipeProfileTag =
  | 'high-protein'
  | 'low-cal-volume'
  | 'energy-dense'
  | 'balanced'
  | 'post-workout'
  | 'quick';

export interface RecipeIngredient {
  foodId: string;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  instructions: string[];
  tags: RecipeProfileTag[];
  ingredients: RecipeIngredient[];
  totalMacros: MacroBreakdown & {
    totalGrams: number;
  };
}

export interface MetabolicCheckin {
  id: string;
  weekDate: string; // YYYY-MM-DD
  avgDailyIntakeKcal: number;
  weightSlopeKgPerWeek: number;
  calculatedRealTdee: number;
  previousTdee: number;
  appliedTdee: number;
  userApproved: boolean;
  loggedDaysInWindow?: number;
  imputedDaysInWindow?: number;
}

// ============================================================================
// FASE 5: CATÁLOGO OPENGYM EN ESPAÑOL, CONSTRUCTOR DE RUTINAS Y FUERZA
// ============================================================================

export type MuscleGroupEs =
  | 'Pecho'
  | 'Espalda / Dorsales'
  | 'Trapecios'
  | 'Hombros (Deltoides)'
  | 'Cuádriceps'
  | 'Isquiotibiales'
  | 'Glúteos'
  | 'Gemelos / Pantorrillas'
  | 'Bíceps'
  | 'Tríceps'
  | 'Antebrazos'
  | 'Abdominales / Core'
  | 'Aductores'
  | 'Abductores'
  | 'Espalda Baja / Lumbares';

export type EquipmentEs =
  | 'Barra'
  | 'Mancuerna'
  | 'Máquina'
  | 'Polea'
  | 'Peso Corporal'
  | 'Pesa Rusa (Kettlebell)'
  | 'Banda Elástica'
  | 'Máquina Smith (Multipower)'
  | 'Barra Z'
  | 'Barra Hexagonal';

export type ExerciseCategoryEs =
  | 'fuerza'
  | 'hipertrofia'
  | 'calistenia'
  | 'cardio'
  | 'movilidad';

export interface ExerciseCatalogItem {
  id: string;
  nameEs: string;
  nameEn: string;
  aliases: string[];
  primaryMuscle: MuscleGroupEs;
  secondaryMuscles: MuscleGroupEs[];
  equipment: EquipmentEs;
  category: ExerciseCategoryEs;
  images: string[]; // [stillImageUrl, animatedGifUrl]
  instructionsEs: string[];
  isUnilateral: boolean;
}

export type ProgressionRuleType = 'double_progression' | 'linear' | 'none';

export interface WorkoutRoutineExercise {
  exerciseId: string;
  order: number;
  supersetGroupId?: string;
  targetSets: number;
  targetRepRange: [number, number];
  targetRir: number;
  restSeconds: number;
  progressionRule: ProgressionRuleType;
  notes?: string;
}

export interface WorkoutRoutine {
  id: string;
  name: string;
  assignedDays: number[]; // 0 = Domingo ... 6 = Sábado
  exercises: WorkoutRoutineExercise[];
}

export type WorkoutSetType = 'warmup' | 'working' | 'dropset' | 'failure';

export interface WorkoutSetLog {
  id: string;
  exerciseId: string;
  setNumber: number;
  setType: WorkoutSetType;
  weightKg: number;
  reps: number;
  rir?: number; // 0 a 4
  isCompleted: boolean;
  isPrWeight: boolean;
  isPr1RM: boolean;
  estimated1RM: number;
}

export interface WorkoutSession {
  id: string;
  routineId?: string;
  routineName?: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bodyweightKgAtSession: number;
  totalVolumeKg: number;
  sets: WorkoutSetLog[];
}
