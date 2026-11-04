import type {
  BiometricLog,
  FoodItem,
  Recipe,
  TimelineLog,
  WorkoutRoutine,
  WorkoutSession,
} from '../types/nutrition';
import { calculateEwmaStep, calculateFoodItemMacros } from '../lib/metabolism';
import { calculateEstimated1RM } from '../lib/strengthAnalytics';

// ============================================================================
// CATÁLOGO SEMILLA DE ALIMENTOS BASE (USDA / OPEN FOOD FACTS VERIFICADOS)
// ============================================================================

export const INITIAL_FOOD_ITEMS: FoodItem[] = [
  // --- PROTEÍNAS MAGRAS & ALIMENTOS PUENTE ---
  {
    id: 'food-chicken-breast',
    barcode: '0000000001001',
    name: 'Pechuga de Pollo (Cocida sin piel)',
    brand: 'USDA Base',
    category: 'protein',
    kcalPer100g: 165,
    proteinPer100g: 31.0,
    carbsPer100g: 0.0,
    fatPer100g: 3.6,
    fiberPer100g: 0.0,
    defaultServingName: 'Filete mediano',
    defaultServingGrams: 150,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-egg-whites',
    barcode: '0000000001002',
    name: 'Claras de Huevo Pasteurizadas',
    brand: 'USDA Base',
    category: 'protein',
    kcalPer100g: 52,
    proteinPer100g: 10.9,
    carbsPer100g: 0.7,
    fatPer100g: 0.2,
    fiberPer100g: 0.0,
    defaultServingName: 'Taza (4 claras)',
    defaultServingGrams: 150,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-tuna-water',
    barcode: '8410000001003',
    name: 'Atún al Natural (En agua, escurrido)',
    brand: 'OpenFoodFacts',
    category: 'protein',
    kcalPer100g: 108,
    proteinPer100g: 24.5,
    carbsPer100g: 0.0,
    fatPer100g: 0.9,
    fiberPer100g: 0.0,
    defaultServingName: 'Lata escurrida',
    defaultServingGrams: 120,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-greek-yogurt-0',
    barcode: '8410000001004',
    name: 'Yogur Griego Magro 0% / Skyr Natural',
    brand: 'High Protein Dairy',
    category: 'dairy',
    kcalPer100g: 59,
    proteinPer100g: 10.3,
    carbsPer100g: 3.6,
    fatPer100g: 0.2,
    fiberPer100g: 0.0,
    defaultServingName: 'Bowl individual',
    defaultServingGrams: 170,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-whey-isolate',
    barcode: '0748927024005',
    name: 'Whey Protein Isolate (Aislado de Suero)',
    brand: 'Sport Nutrition',
    category: 'protein',
    kcalPer100g: 375,
    proteinPer100g: 84.0,
    carbsPer100g: 4.0,
    fatPer100g: 2.2,
    fiberPer100g: 0.5,
    defaultServingName: 'Scoop estándar',
    defaultServingGrams: 30,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-lean-beef',
    barcode: '0000000001006',
    name: 'Lomo / Peceto Vacuno Magro (Cocido)',
    brand: 'USDA Base',
    category: 'protein',
    kcalPer100g: 184,
    proteinPer100g: 28.7,
    carbsPer100g: 0.0,
    fatPer100g: 7.1,
    fiberPer100g: 0.0,
    defaultServingName: 'Bife magro',
    defaultServingGrams: 160,
    isCustom: false,
    isFavorite: false,
    isBridgeFood: false,
  },
  {
    id: 'food-whole-egg',
    barcode: '0000000001007',
    name: 'Huevo Entero Fresco (Cocido / Plancha)',
    brand: 'USDA Base',
    category: 'protein',
    kcalPer100g: 155,
    proteinPer100g: 12.6,
    carbsPer100g: 1.1,
    fatPer100g: 10.6,
    fiberPer100g: 0.0,
    defaultServingName: '2 Huevos Grandes (L)',
    defaultServingGrams: 110,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: false,
  },
  {
    id: 'food-salmon',
    barcode: '0000000001008',
    name: 'Salmón Rosado Atlántico (Horneado)',
    brand: 'USDA Base',
    category: 'protein',
    kcalPer100g: 206,
    proteinPer100g: 22.1,
    carbsPer100g: 0.0,
    fatPer100g: 12.4,
    fiberPer100g: 0.0,
    defaultServingName: 'Lonja mediana',
    defaultServingGrams: 150,
    isCustom: false,
    isFavorite: false,
    isBridgeFood: false,
  },
  {
    id: 'food-cottage-cheese',
    barcode: '8410000001009',
    name: 'Queso Cottage Magro (Bajo en Grasa)',
    brand: 'High Protein Dairy',
    category: 'dairy',
    kcalPer100g: 82,
    proteinPer100g: 12.4,
    carbsPer100g: 3.1,
    fatPer100g: 2.0,
    fiberPer100g: 0.0,
    defaultServingName: 'Porción',
    defaultServingGrams: 150,
    isCustom: false,
    isFavorite: false,
    isBridgeFood: true,
  },

  // --- CARBOHIDRATOS COMPLEJOS & ALIMENTOS PUENTE ---
  {
    id: 'food-white-rice',
    barcode: '0000000002001',
    name: 'Arroz Blanco Jazmín / Largo Fino (Cocido)',
    brand: 'USDA Base',
    category: 'carb',
    kcalPer100g: 130,
    proteinPer100g: 2.7,
    carbsPer100g: 28.2,
    fatPer100g: 0.3,
    fiberPer100g: 0.4,
    defaultServingName: 'Taza cocida',
    defaultServingGrams: 180,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-rolled-oats',
    barcode: '0000000002002',
    name: 'Avena Tradicional en Hojuelas (Peso en seco)',
    brand: 'USDA Base',
    category: 'carb',
    kcalPer100g: 379,
    proteinPer100g: 13.2,
    carbsPer100g: 67.7,
    fatPer100g: 6.5,
    fiberPer100g: 10.1,
    defaultServingName: 'Taza / Porción',
    defaultServingGrams: 60,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-boiled-potato',
    barcode: '0000000002003',
    name: 'Papa / Patata Cocida o al Vapor (Alta saciedad)',
    brand: 'USDA Base',
    category: 'carb',
    kcalPer100g: 87,
    proteinPer100g: 1.9,
    carbsPer100g: 20.1,
    fatPer100g: 0.1,
    fiberPer100g: 1.8,
    defaultServingName: 'Porción guarnición',
    defaultServingGrams: 250,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-sweet-potato',
    barcode: '0000000002004',
    name: 'Batata / Boniato Asado',
    brand: 'USDA Base',
    category: 'carb',
    kcalPer100g: 90,
    proteinPer100g: 2.0,
    carbsPer100g: 20.7,
    fatPer100g: 0.2,
    fiberPer100g: 3.3,
    defaultServingName: 'Unidad mediana',
    defaultServingGrams: 200,
    isCustom: false,
    isFavorite: false,
    isBridgeFood: true,
  },
  {
    id: 'food-banana',
    barcode: '0000000002005',
    name: 'Banana / Plátano Maduro',
    brand: 'USDA Base',
    category: 'fruit_veg',
    kcalPer100g: 89,
    proteinPer100g: 1.1,
    carbsPer100g: 22.8,
    fatPer100g: 0.3,
    fiberPer100g: 2.6,
    defaultServingName: 'Unidad mediana',
    defaultServingGrams: 120,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-sourdough-bread',
    barcode: '8410000002006',
    name: 'Pan Integral de Masa Madre',
    brand: 'Artisan Bakery',
    category: 'carb',
    kcalPer100g: 252,
    proteinPer100g: 9.8,
    carbsPer100g: 46.5,
    fatPer100g: 2.4,
    fiberPer100g: 6.2,
    defaultServingName: '2 Rebanadas',
    defaultServingGrams: 80,
    isCustom: false,
    isFavorite: false,
    isBridgeFood: true,
  },
  {
    id: 'food-blueberries',
    barcode: '0000000002007',
    name: 'Arándanos / Frutos Rojos Frescos',
    brand: 'USDA Base',
    category: 'fruit_veg',
    kcalPer100g: 57,
    proteinPer100g: 0.7,
    carbsPer100g: 14.5,
    fatPer100g: 0.3,
    fiberPer100g: 2.4,
    defaultServingName: 'Taza',
    defaultServingGrams: 100,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: false,
  },
  {
    id: 'food-broccoli',
    barcode: '0000000002008',
    name: 'Brócoli y Vegetales Verdes al Vapor',
    brand: 'USDA Base',
    category: 'fruit_veg',
    kcalPer100g: 35,
    proteinPer100g: 2.4,
    carbsPer100g: 7.2,
    fatPer100g: 0.4,
    fiberPer100g: 3.3,
    defaultServingName: 'Bowl de volumen',
    defaultServingGrams: 200,
    isCustom: false,
    isFavorite: false,
    isBridgeFood: false,
  },

  // --- GRASAS SALUDABLES & ALIMENTOS PUENTE ---
  {
    id: 'food-olive-oil',
    barcode: '8410000003001',
    name: 'Aceite de Oliva Virgen Extra (AOVE)',
    brand: 'Mediterranean',
    category: 'fat',
    kcalPer100g: 884,
    proteinPer100g: 0.0,
    carbsPer100g: 0.0,
    fatPer100g: 100.0,
    fiberPer100g: 0.0,
    defaultServingName: 'Cucharada sopera',
    defaultServingGrams: 10,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-avocado',
    barcode: '0000000003002',
    name: 'Palta / Aguacate Hass Fresco',
    brand: 'USDA Base',
    category: 'fat',
    kcalPer100g: 160,
    proteinPer100g: 2.0,
    carbsPer100g: 8.5,
    fatPer100g: 14.7,
    fiberPer100g: 6.7,
    defaultServingName: 'Media unidad',
    defaultServingGrams: 80,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-peanut-butter',
    barcode: '8410000003003',
    name: 'Mantequilla de Maní 100% Natural',
    brand: 'Whole Nut',
    category: 'fat',
    kcalPer100g: 588,
    proteinPer100g: 25.1,
    carbsPer100g: 20.0,
    fatPer100g: 50.4,
    fiberPer100g: 6.0,
    defaultServingName: 'Cucharada colmada',
    defaultServingGrams: 25,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
  {
    id: 'food-almonds',
    barcode: '0000000003004',
    name: 'Almendras Naturales Tostadas',
    brand: 'USDA Base',
    category: 'fat',
    kcalPer100g: 579,
    proteinPer100g: 21.2,
    carbsPer100g: 21.6,
    fatPer100g: 49.9,
    fiberPer100g: 12.5,
    defaultServingName: 'Puñado (20 almendras)',
    defaultServingGrams: 25,
    isCustom: false,
    isFavorite: true,
    isBridgeFood: true,
  },
];

// Helper interno para calcular totalMacros exactos de cada receta semilla
function buildSeedRecipe(
  recipeData: Omit<Recipe, 'totalMacros'>,
  foods: FoodItem[]
): Recipe {
  const foodMap = Object.fromEntries(foods.map((f) => [f.id, f]));
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let fiberG = 0;
  let totalGrams = 0;

  for (const ing of recipeData.ingredients) {
    const food = foodMap[ing.foodId];
    if (food) {
      const m = calculateFoodItemMacros(food, ing.grams);
      kcal += m.kcal;
      proteinG += m.proteinG;
      carbsG += m.carbsG;
      fatG += m.fatG;
      fiberG += m.fiberG;
      totalGrams += ing.grams;
    }
  }

  return {
    ...recipeData,
    totalMacros: {
      kcal: Math.round(kcal),
      proteinG: Number(proteinG.toFixed(1)),
      carbsG: Number(carbsG.toFixed(1)),
      fatG: Number(fatG.toFixed(1)),
      fiberG: Number(fiberG.toFixed(1)),
      totalGrams,
    },
  };
}

// ============================================================================
// CATÁLOGO DE RECETAS FITNESS AUTO-ESCALABLES POR PERFIL NUTRICIONAL
// ============================================================================

export const INITIAL_RECIPES: Recipe[] = [
  buildSeedRecipe(
    {
      id: 'recipe-anabolic-chicken-bowl',
      name: 'Bowl Proteico de Pollo, Arroz Jazmín y Palta',
      description:
        'Comida post-entreno de alta biodisponibilidad proteica, recarga glucogénica rápida y lípidos monoinsaturados.',
      tags: ['high-protein', 'post-workout', 'balanced'],
      ingredients: [
        { foodId: 'food-chicken-breast', grams: 170 },
        { foodId: 'food-white-rice', grams: 180 },
        { foodId: 'food-avocado', grams: 60 },
        { foodId: 'food-broccoli', grams: 120 },
      ],
      instructions: [
        'Sellar la pechuga de pollo cortada en cubos a fuego medio-alto con especias y sal marina.',
        'Servir sobre la base de arroz jazmín cocido y brócoli al vapor.',
        'Coronar con láminas de palta Hass fresca.',
      ],
    },
    INITIAL_FOOD_ITEMS
  ),
  buildSeedRecipe(
    {
      id: 'recipe-high-volume-deficit-scramble',
      name: 'Sartén de Alto Volumen Gástrico (Claras, Papa y Vegetales)',
      description:
        'Diseñada específicamente para fases de Déficit Calórico (Cut): máxima distensión gástrica y saciedad con mínima densidad energética.',
      tags: ['low-cal-volume', 'high-protein', 'quick'],
      ingredients: [
        { foodId: 'food-egg-whites', grams: 220 },
        { foodId: 'food-whole-egg', grams: 55 },
        { foodId: 'food-boiled-potato', grams: 250 },
        { foodId: 'food-broccoli', grams: 180 },
      ],
      instructions: [
        'Cortar las papas previamente hervidas en dados y dorar en sartén antiadherente con los floretas de brócoli.',
        'Incorporar el huevo entero batido con las claras pasteurizadas.',
        'Revolver suavemente hasta lograr textura cremosa.',
      ],
    },
    INITIAL_FOOD_ITEMS
  ),
  buildSeedRecipe(
    {
      id: 'recipe-lean-bulk-proats',
      name: 'Proats Densos en Energía (Avena, Whey Isolate, Banana y Maní)',
      description:
        'Fórmula densa en calorías limpias y micronutrientes para cubrir requerimientos de Volumen Limpio (Lean Bulk) sin pesadez digestiva.',
      tags: ['energy-dense', 'high-protein', 'post-workout'],
      ingredients: [
        { foodId: 'food-rolled-oats', grams: 80 },
        { foodId: 'food-whey-isolate', grams: 35 },
        { foodId: 'food-banana', grams: 120 },
        { foodId: 'food-peanut-butter', grams: 25 },
        { foodId: 'food-blueberries', grams: 60 },
      ],
      instructions: [
        'Cocinar la avena en hojuelas con agua o bebida vegetal durante 3 minutos hasta espesar.',
        'Retirar del fuego, dejar atemperar 1 minuto e integrar el scoop de Whey Isolate revolviendo enérgicamente.',
        'Añadir rodajas de banana, arándanos y la mantequilla de maní natural en la superficie.',
      ],
    },
    INITIAL_FOOD_ITEMS
  ),
  buildSeedRecipe(
    {
      id: 'recipe-skyr-protein-parfait',
      name: 'Parfait Nocturno de Skyr 0%, Frutos Rojos y Almendras',
      description:
        'Cierre de macros rápido rico en caseína/proteína láctea de absorción sostenida, antioxidantes y fibra.',
      tags: ['high-protein', 'low-cal-volume', 'quick'],
      ingredients: [
        { foodId: 'food-greek-yogurt-0', grams: 250 },
        { foodId: 'food-whey-isolate', grams: 20 },
        { foodId: 'food-blueberries', grams: 100 },
        { foodId: 'food-almonds', grams: 20 },
      ],
      instructions: [
        'Mezclar el yogur griego 0% con el aislado de suero hasta obtener una mousse homogénea.',
        'Intercalar capas con los arándanos frescos y las almendras fileteadas.',
      ],
    },
    INITIAL_FOOD_ITEMS
  ),
];

/**
 * Genera una simulación realista de 21 días de registros biométricos (con ruido hídrico diario
 * vs. suavizado EWMA) y registros nutricionales (incluyendo 2 días vacíos para demostrar la imputación inteligente).
 */
export function generateSimulated21DayHistory(params: {
  initialWeightKg: number;
  initialBfPercent: number;
  targetKcal: number;
  alpha: number;
  bfMethod: 'us_navy' | 'boer_fallback';
  neckCm?: number;
  waistCm?: number;
  hipCm?: number;
  heightCm: number;
}): {
  biometricLogs: BiometricLog[];
  timelineLogs: TimelineLog[];
} {
  const {
    initialWeightKg,
    initialBfPercent,
    targetKcal,
    alpha,
    bfMethod,
    neckCm,
    waistCm,
    hipCm,
    heightCm,
  } = params;

  const biometricLogs: BiometricLog[] = [];
  const timelineLogs: TimelineLog[] = [];

  const today = new Date();
  let prevTrendWeight: number | undefined;

  // Simulamos una tendencia fisiológica real de -0.045 kg/día (-0.315 kg/sem) con fluctuaciones hídricas de ±0.45 kg
  const waterFluctuations = [
    0.0, 0.35, -0.2, 0.45, -0.15, -0.35, 0.25,
    0.4, -0.3, -0.1, 0.3, -0.4, 0.15, -0.25,
    0.35, -0.2, -0.35, 0.2, -0.15, -0.3, -0.1,
  ];

  for (let i = 20; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayIndex = 20 - i;

    const trueWeight = initialWeightKg - dayIndex * 0.045;
    const scaleWeightKg = Number((trueWeight + waterFluctuations[dayIndex]).toFixed(2));
    const trendWeightKg = calculateEwmaStep(scaleWeightKg, prevTrendWeight, alpha);
    prevTrendWeight = trendWeightKg;

    const estimatedBfPercent = Number(Math.max(5, initialBfPercent - dayIndex * 0.03).toFixed(2));
    const lbmKg = Number((trendWeightKg * (1 - estimatedBfPercent / 100)).toFixed(2));
    const fatMassKg = Number((trendWeightKg - lbmKg).toFixed(2));
    const whtr = waistCm ? Number(((waistCm - dayIndex * 0.04) / heightCm).toFixed(3)) : undefined;

    biometricLogs.push({
      id: `bio-seed-${dateStr}`,
      date: dateStr,
      scaleWeightKg,
      trendWeightKg,
      neckCm,
      waistCm: waistCm ? Number((waistCm - dayIndex * 0.04).toFixed(1)) : undefined,
      hipCm,
      estimatedBfPercent,
      bfMethod,
      lbmKg,
      fatMassKg,
      whtr,
      sleepHours: Number((7.2 + (dayIndex % 3) * 0.3).toFixed(1)),
      steps: 8500 + (dayIndex % 5) * 650,
    });

    // Dejar 2 días vacíos (día 6 y día 14) para demostrar la Imputación Inteligente del algoritmo adaptativo
    const isVacationDay = dayIndex === 6 || dayIndex === 14;
    if (!isVacationDay && i > 0) {
      const dailyKcalVariation = ((dayIndex % 5) - 2) * 35;
      const dayKcal = Math.round(targetKcal + dailyKcalVariation);
      timelineLogs.push({
        id: `tl-seed-${dateStr}-1`,
        date: dateStr,
        hour: 9,
        recipeId: 'recipe-lean-bulk-proats',
        customLabel: 'Desayuno Registrado',
        gramsConsumed: 320,
        calculatedMacros: {
          kcal: Math.round(dayKcal * 0.35),
          proteinG: 48,
          carbsG: 65,
          fatG: 18,
          fiberG: 10,
        },
      });
      timelineLogs.push({
        id: `tl-seed-${dateStr}-2`,
        date: dateStr,
        hour: 14,
        recipeId: 'recipe-anabolic-chicken-bowl',
        customLabel: 'Almuerzo Registrado',
        gramsConsumed: 530,
        calculatedMacros: {
          kcal: Math.round(dayKcal * 0.65),
          proteinG: 112,
          carbsG: 120,
          fatG: 38,
          fiberG: 18,
        },
      });
    }
  }

  return { biometricLogs, timelineLogs };
}

// ============================================================================
// PLANTILLAS DE RUTINAS SEMILLA (FASE 5: OPENGYM CONSTRUCTOR & FUERZA)
// ============================================================================

export const INITIAL_WORKOUT_ROUTINES: WorkoutRoutine[] = [
  {
    id: 'routine-push-heavy',
    name: 'Torso Empuje (Pecho, Hombros y Tríceps)',
    assignedDays: [1, 4], // Lunes y Jueves
    exercises: [
      {
        exerciseId: 'og-0025',
        order: 1,
        targetSets: 3,
        targetRepRange: [6, 10],
        targetRir: 1,
        restSeconds: 150,
        progressionRule: 'double_progression',
        notes: 'Retracción escapular firme y pausa de 1s sobre el esternón.',
      },
      {
        exerciseId: 'og-0314',
        order: 2,
        targetSets: 3,
        targetRepRange: [8, 12],
        targetRir: 1,
        restSeconds: 120,
        progressionRule: 'double_progression',
        notes: 'Banco a 30° priorizando estiramiento clavicular.',
      },
      {
        exerciseId: 'og-0426',
        order: 3,
        targetSets: 3,
        targetRepRange: [6, 10],
        targetRir: 2,
        restSeconds: 120,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-0334',
        order: 4,
        supersetGroupId: 'SS-A',
        targetSets: 3,
        targetRepRange: [12, 15],
        targetRir: 1,
        restSeconds: 45,
        progressionRule: 'double_progression',
        notes: 'Superserie A con Extensión de Tríceps en Polea.',
      },
      {
        exerciseId: 'og-0241',
        order: 5,
        supersetGroupId: 'SS-A',
        targetSets: 3,
        targetRepRange: [10, 15],
        targetRir: 1,
        restSeconds: 90,
        progressionRule: 'double_progression',
      },
    ],
  },
  {
    id: 'routine-pull-hypertrophy',
    name: 'Tracción Dorsal & Cadena Posterior Alta',
    assignedDays: [2, 5], // Martes y Viernes
    exercises: [
      {
        exerciseId: 'og-2330',
        order: 1,
        targetSets: 3,
        targetRepRange: [8, 12],
        targetRir: 1,
        restSeconds: 120,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-0027',
        order: 2,
        targetSets: 3,
        targetRepRange: [6, 10],
        targetRir: 1,
        restSeconds: 150,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-1323',
        order: 3,
        targetSets: 3,
        targetRepRange: [10, 12],
        targetRir: 1,
        restSeconds: 120,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-0031',
        order: 4,
        supersetGroupId: 'SS-B',
        targetSets: 3,
        targetRepRange: [8, 12],
        targetRir: 1,
        restSeconds: 60,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-0313',
        order: 5,
        supersetGroupId: 'SS-B',
        targetSets: 3,
        targetRepRange: [10, 14],
        targetRir: 1,
        restSeconds: 90,
        progressionRule: 'double_progression',
      },
    ],
  },
  {
    id: 'routine-legs-quad-glute',
    name: 'Pierna Énfasis Cuádriceps, Glúteo e Isquios',
    assignedDays: [3, 6], // Miércoles y Sábado
    exercises: [
      {
        exerciseId: 'og-0043',
        order: 1,
        targetSets: 3,
        targetRepRange: [6, 8],
        targetRir: 2,
        restSeconds: 180,
        progressionRule: 'double_progression',
        notes: 'Profundidad rompiendo paralelo con bracing 360°.',
      },
      {
        exerciseId: 'og-0085',
        order: 2,
        targetSets: 3,
        targetRepRange: [8, 10],
        targetRir: 2,
        restSeconds: 150,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-1409',
        order: 3,
        targetSets: 3,
        targetRepRange: [8, 12],
        targetRir: 1,
        restSeconds: 120,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-0585',
        order: 4,
        supersetGroupId: 'SS-C',
        targetSets: 3,
        targetRepRange: [10, 15],
        targetRir: 1,
        restSeconds: 60,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-0586',
        order: 5,
        supersetGroupId: 'SS-C',
        targetSets: 3,
        targetRepRange: [10, 15],
        targetRir: 1,
        restSeconds: 90,
        progressionRule: 'double_progression',
      },
      {
        exerciseId: 'og-0605',
        order: 6,
        targetSets: 3,
        targetRepRange: [12, 15],
        targetRir: 1,
        restSeconds: 60,
        progressionRule: 'double_progression',
      },
    ],
  },
];

/**
 * Genera sesiones históricas realistas de los últimos 18 días para poblar:
 * - El motor de Doble Progresión (Ghost Text)
 * - La curva de evolución de 1RM vs. Peso en Tendencia EWMA
 * - El rastreador de Volumen Semanal por Grupo Muscular (MV / MEV / MAV)
 */
export function generateInitialWorkoutSessions(bodyweightKg = 80): WorkoutSession[] {
  const today = new Date();
  const dateMinusDays = (days: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() - days);
    return d.toISOString().slice(0, 10);
  };

  return [
    {
      id: 'ws-seed-push-1',
      routineId: 'routine-push-heavy',
      routineName: 'Torso Empuje (Pecho, Hombros y Tríceps)',
      date: dateMinusDays(14),
      startTime: '18:00',
      endTime: '19:05',
      durationMinutes: 65,
      bodyweightKgAtSession: Number((bodyweightKg + 0.6).toFixed(1)),
      totalVolumeKg: 6840,
      sets: [
        {
          id: 'set-p1-w',
          exerciseId: 'og-0025',
          setNumber: 1,
          setType: 'warmup',
          weightKg: 50,
          reps: 10,
          rir: 4,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: 0,
        },
        ...[9, 9, 8].map((reps, i) => ({
          id: `set-p1-${i}`,
          exerciseId: 'og-0025',
          setNumber: i + 2,
          setType: 'working' as const,
          weightKg: 82.5,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(82.5, reps, 'working'),
        })),
        ...[10, 10, 9].map((reps, i) => ({
          id: `set-p1-inc-${i}`,
          exerciseId: 'og-0314',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 28,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(28, reps, 'working'),
        })),
      ],
    },
    {
      id: 'ws-seed-legs-1',
      routineId: 'routine-legs-quad-glute',
      routineName: 'Pierna Énfasis Cuádriceps, Glúteo e Isquios',
      date: dateMinusDays(10),
      startTime: '17:30',
      endTime: '18:45',
      durationMinutes: 75,
      bodyweightKgAtSession: Number((bodyweightKg + 0.4).toFixed(1)),
      totalVolumeKg: 8920,
      sets: [
        ...[7, 7, 6].map((reps, i) => ({
          id: `set-l1-sq-${i}`,
          exerciseId: 'og-0043',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 112.5,
          reps,
          rir: 2,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(112.5, reps, 'working'),
        })),
        ...[9, 9, 8].map((reps, i) => ({
          id: `set-l1-rdl-${i}`,
          exerciseId: 'og-0085',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 105,
          reps,
          rir: 2,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(105, reps, 'working'),
        })),
      ],
    },
    {
      id: 'ws-seed-push-2',
      routineId: 'routine-push-heavy',
      routineName: 'Torso Empuje (Pecho, Hombros y Tríceps)',
      date: dateMinusDays(4),
      startTime: '18:15',
      endTime: '19:20',
      durationMinutes: 65,
      bodyweightKgAtSession: Number((bodyweightKg + 0.1).toFixed(1)),
      totalVolumeKg: 7650,
      sets: [
        // Logró 10, 10, 10 en rango [6, 10] -> Desbloquea sobrecarga +2.5 kg (87.5 kg x 6) en la próxima sesión
        ...[10, 10, 10].map((reps, i) => ({
          id: `set-p2-bp-${i}`,
          exerciseId: 'og-0025',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 85,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: i === 0,
          isPr1RM: i === 0,
          estimated1RM: calculateEstimated1RM(85, reps, 'working'),
        })),
        ...[12, 11, 10].map((reps, i) => ({
          id: `set-p2-inc-${i}`,
          exerciseId: 'og-0314',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 30,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: i === 0,
          isPr1RM: i === 0,
          estimated1RM: calculateEstimated1RM(30, reps, 'working'),
        })),
        ...[8, 8, 7].map((reps, i) => ({
          id: `set-p2-ohp-${i}`,
          exerciseId: 'og-0426',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 52.5,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(52.5, reps, 'working'),
        })),
        ...[14, 14, 12].map((reps, i) => ({
          id: `set-p2-lat-${i}`,
          exerciseId: 'og-0334',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 14,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(14, reps, 'working'),
        })),
        ...[12, 12, 12].map((reps, i) => ({
          id: `set-p2-tri-${i}`,
          exerciseId: 'og-0241',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 32,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(32, reps, 'working'),
        })),
      ],
    },
    {
      id: 'ws-seed-pull-2',
      routineId: 'routine-pull-hypertrophy',
      routineName: 'Tracción Dorsal & Cadena Posterior Alta',
      date: dateMinusDays(3),
      startTime: '18:00',
      endTime: '19:10',
      durationMinutes: 70,
      bodyweightKgAtSession: bodyweightKg,
      totalVolumeKg: 7980,
      sets: [
        ...[11, 10, 10].map((reps, i) => ({
          id: `set-pl2-lat-${i}`,
          exerciseId: 'og-2330',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 70,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(70, reps, 'working'),
        })),
        ...[9, 8, 8].map((reps, i) => ({
          id: `set-pl2-row-${i}`,
          exerciseId: 'og-0027',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 80,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: true,
          isPr1RM: true,
          estimated1RM: calculateEstimated1RM(80, reps, 'working'),
        })),
        ...[11, 11, 10].map((reps, i) => ({
          id: `set-pl2-gir-${i}`,
          exerciseId: 'og-1323',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 65,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(65, reps, 'working'),
        })),
        ...[10, 10, 9].map((reps, i) => ({
          id: `set-pl2-bic-${i}`,
          exerciseId: 'og-0031',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 35,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(35, reps, 'working'),
        })),
      ],
    },
    {
      id: 'ws-seed-legs-2',
      routineId: 'routine-legs-quad-glute',
      routineName: 'Pierna Énfasis Cuádriceps, Glúteo e Isquios',
      date: dateMinusDays(1),
      startTime: '17:45',
      endTime: '19:00',
      durationMinutes: 75,
      bodyweightKgAtSession: bodyweightKg,
      totalVolumeKg: 9640,
      sets: [
        ...[8, 8, 8].map((reps, i) => ({
          id: `set-l2-sq-${i}`,
          exerciseId: 'og-0043',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 117.5,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: i === 0,
          isPr1RM: i === 0,
          estimated1RM: calculateEstimated1RM(117.5, reps, 'working'),
        })),
        ...[10, 10, 9].map((reps, i) => ({
          id: `set-l2-rdl-${i}`,
          exerciseId: 'og-0085',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 110,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: i === 0,
          isPr1RM: i === 0,
          estimated1RM: calculateEstimated1RM(110, reps, 'working'),
        })),
        ...[12, 11, 10].map((reps, i) => ({
          id: `set-l2-ht-${i}`,
          exerciseId: 'og-1409',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 130,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: true,
          isPr1RM: true,
          estimated1RM: calculateEstimated1RM(130, reps, 'working'),
        })),
        ...[14, 13, 12].map((reps, i) => ({
          id: `set-l2-ext-${i}`,
          exerciseId: 'og-0585',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 65,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(65, reps, 'working'),
        })),
        ...[13, 12, 12].map((reps, i) => ({
          id: `set-l2-curl-${i}`,
          exerciseId: 'og-0586',
          setNumber: i + 1,
          setType: 'working' as const,
          weightKg: 50,
          reps,
          rir: 1,
          isCompleted: true,
          isPrWeight: false,
          isPr1RM: false,
          estimated1RM: calculateEstimated1RM(50, reps, 'working'),
        })),
      ],
    },
  ];
}

