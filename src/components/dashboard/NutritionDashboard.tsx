import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChefHat,
  Clock,
  Copy,
  Globe,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react';
import type { FoodItem, MacroBreakdown } from '../../types/nutrition';
import {
  calculateFoodItemMacros,
  calculateRemainingMacros,
  scaleRecipeToRemaining,
  suggestBridgeFoods,
} from '../../lib/metabolism';
import { useNutritionStore } from '../../store/useNutritionStore';

const QUICK_MEAL_SLOTS = [
  { label: 'Desayuno', hour: 8 },
  { label: 'Almuerzo', hour: 13 },
  { label: 'Merienda', hour: 17 },
  { label: 'Cena', hour: 21 },
];

function getHourFriendlyLabel(hour: number): string {
  if (hour <= 10) return 'Desayuno';
  if (hour <= 15) return 'Almuerzo';
  if (hour <= 19) return 'Merienda';
  return 'Cena';
}

export const NutritionDashboard: React.FC = () => {
  const userProfile = useNutritionStore((s) => s.userProfile);
  const foods = useNutritionStore((s) => s.foods);
  const recipes = useNutritionStore((s) => s.recipes);
  const timelineLogs = useNutritionStore((s) => s.timelineLogs);
  const selectedDate = useNutritionStore((s) => s.selectedDate);

  const setSelectedDate = useNutritionStore((s) => s.setSelectedDate);
  const addTimelineLog = useNutritionStore((s) => s.addTimelineLog);
  const updateTimelineLogGrams = useNutritionStore(
    (s) => s.updateTimelineLogGrams
  );
  const removeTimelineLog = useNutritionStore((s) => s.removeTimelineLog);
  const multiPasteTimelineLogs = useNutritionStore(
    (s) => s.multiPasteTimelineLogs
  );
  const addCustomFood = useNutritionStore((s) => s.addCustomFood);

  const [activeHourToLog, setActiveHourToLog] = useState<number>(13);
  const [selectedLogIdsForPaste, setSelectedLogIdsForPaste] = useState<
    string[]
  >([]);
  const [targetPasteDate, setTargetPasteDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);

  const [foodQuery, setFoodQuery] = useState<string>('');
  const [selectedFoodGrams, setSelectedFoodGrams] = useState<number>(150);
  const [offLoading, setOffLoading] = useState<boolean>(false);
  const [offResults, setOffResults] = useState<FoodItem[]>([]);
  const [isCustomFoodOpen, setIsCustomFoodOpen] = useState<boolean>(false);
  const [customFoodName, setCustomFoodName] = useState<string>('');
  const [customKcal100, setCustomKcal100] = useState<number | ''>('');
  const [customProtein100, setCustomProtein100] = useState<number | ''>('');
  const [customCarbs100, setCustomCarbs100] = useState<number | ''>('');
  const [customFat100, setCustomFat100] = useState<number | ''>('');
  const [customServingGrams, setCustomServingGrams] = useState<number>(100);

  const foodsMap = useMemo(
    () => Object.fromEntries(foods.map((f) => [f.id, f])),
    [foods]
  );

  const dayLogs = useMemo(
    () => timelineLogs.filter((l) => l.date === selectedDate),
    [timelineLogs, selectedDate]
  );

  const consumedMacros: MacroBreakdown = useMemo(() => {
    return dayLogs.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.calculatedMacros.kcal,
        proteinG: Number(
          (acc.proteinG + item.calculatedMacros.proteinG).toFixed(1)
        ),
        carbsG: Number((acc.carbsG + item.calculatedMacros.carbsG).toFixed(1)),
        fatG: Number((acc.fatG + item.calculatedMacros.fatG).toFixed(1)),
        fiberG: Number((acc.fiberG + item.calculatedMacros.fiberG).toFixed(1)),
      }),
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }
    );
  }, [dayLogs]);

  const targetMacros: MacroBreakdown = useMemo(
    () => ({
      kcal: userProfile?.targetKcal ?? 2400,
      proteinG: userProfile?.targetProteinG ?? 175,
      carbsG: userProfile?.targetCarbsG ?? 250,
      fatG: userProfile?.targetFatG ?? 65,
      fiberG: userProfile?.targetFiberG ?? 34,
    }),
    [userProfile]
  );

  const remainingVector = useMemo(
    () => calculateRemainingMacros(targetMacros, consumedMacros),
    [targetMacros, consumedMacros]
  );

  const bridgeSuggestions = useMemo(
    () => suggestBridgeFoods(remainingVector, foods).slice(0, 3),
    [remainingVector, foods]
  );

  const scaledRecipes = useMemo(
    () =>
      recipes
        .slice(0, 3)
        .map((r) => scaleRecipeToRemaining(r, remainingVector, foodsMap)),
    [recipes, remainingVector, foodsMap]
  );

  const filteredLocalFoods = useMemo(() => {
    const q = foodQuery.trim().toLowerCase();
    if (!q) return foods.slice(0, 6);
    return foods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.brand && f.brand.toLowerCase().includes(q)) ||
        (f.barcode && f.barcode.includes(q))
    );
  }, [foods, foodQuery]);

  const handleSearchOpenFoodFacts = async () => {
    const q = foodQuery.trim();
    if (!q) return;
    setOffLoading(true);
    try {
      const isBarcode = /^\d{8,14}$/.test(q);
      if (isBarcode) {
        const res = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${q}.json`
        );
        const data = await res.json();
        if (data?.product) {
          const p = data.product;
          const n = p.nutriments || {};
          const item: FoodItem = {
            id: `off-${q}`,
            barcode: q,
            name: p.product_name_es || p.product_name || `Producto ${q}`,
            brand: p.brands || 'OpenFoodFacts',
            kcalPer100g: Math.round(Number(n['energy-kcal_100g'] || 0)),
            proteinPer100g: Number(Number(n.proteins_100g || 0).toFixed(1)),
            carbsPer100g: Number(Number(n.carbohydrates_100g || 0).toFixed(1)),
            fatPer100g: Number(Number(n.fat_100g || 0).toFixed(1)),
            fiberPer100g: Number(Number(n.fiber_100g || 0).toFixed(1)),
            defaultServingName: 'Porción 100g',
            defaultServingGrams: 100,
            isCustom: true,
            isFavorite: false,
          };
          setOffResults([item]);
        }
      } else {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
          q
        )}&search_simple=1&action=process&json=1&page_size=5`;
        const res = await fetch(url);
        const data = await res.json();
        const list: FoodItem[] = (data?.products || []).map(
          (p: Record<string, any>, idx: number) => {
            const n = p.nutriments || {};
            return {
              id: `off-${p.code || idx}`,
              barcode: p.code,
              name:
                p.product_name_es ||
                p.product_name ||
                'Alimento OpenFoodFacts',
              brand: p.brands || 'OpenFoodFacts',
              kcalPer100g: Math.round(Number(n['energy-kcal_100g'] || 0)),
              proteinPer100g: Number(Number(n.proteins_100g || 0).toFixed(1)),
              carbsPer100g: Number(
                Number(n.carbohydrates_100g || 0).toFixed(1)
              ),
              fatPer100g: Number(Number(n.fat_100g || 0).toFixed(1)),
              fiberPer100g: Number(Number(n.fiber_100g || 0).toFixed(1)),
              defaultServingName: '100g',
              defaultServingGrams: 100,
              isCustom: true,
              isFavorite: false,
            };
          }
        );
        setOffResults(list);
      }
    } catch {
      setOffResults([]);
    } finally {
      setOffLoading(false);
    }
  };

  const handleMultiPaste = () => {
    if (selectedLogIdsForPaste.length === 0) return;
    multiPasteTimelineLogs(selectedLogIdsForPaste, [targetPasteDate]);
    setPasteFeedback(
      `${selectedLogIdsForPaste.length} comidas copiadas al día ${targetPasteDate}.`
    );
    setSelectedLogIdsForPaste([]);
    setTimeout(() => setPasteFeedback(null), 3000);
  };

  const pct = (val: number, target: number) =>
    Math.min(100, Math.round((val / Math.max(1, target)) * 100));

  const loggedHours = useMemo(() => {
    const hours = Array.from(new Set(dayLogs.map((l) => l.hour))).sort(
      (a, b) => a - b
    );
    return hours;
  }, [dayLogs]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* ====================================================================
          RESUMEN SIMPLE DEL DÍA
         ==================================================================== */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Tus Comidas de Hoy
            </h1>
            <p className="text-sm text-slate-500">
              {remainingVector.kcal > 0
                ? `Te faltan ${remainingVector.kcal} kcal y ${Math.max(0, remainingVector.P)}g de proteína para tu meta.`
                : '¡Ya alcanzaste tu meta de calorías de hoy!'}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Calendar className="h-4 w-4 text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-800 focus:outline-none"
            />
          </div>
        </div>

        {/* 4 Tarjetas de Progreso Claras */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>Calorías</span>
              <span className="text-emerald-700">
                {remainingVector.kcal >= 0
                  ? `Faltan ${remainingVector.kcal}`
                  : `+${Math.abs(remainingVector.kcal)}`}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-900">
                {consumedMacros.kcal}
              </span>
              <span className="text-xs text-slate-500">
                / {targetMacros.kcal} kcal
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{
                  width: `${pct(consumedMacros.kcal, targetMacros.kcal)}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-blue-50/50 p-4 ring-1 ring-blue-100">
            <div className="flex items-center justify-between text-xs font-bold text-blue-800">
              <span>Proteínas</span>
              <span>
                {remainingVector.P >= 0
                  ? `Faltan ${remainingVector.P}g`
                  : 'Listo'}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-900">
                {consumedMacros.proteinG}g
              </span>
              <span className="text-xs text-slate-500">
                / {targetMacros.proteinG}g
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{
                  width: `${pct(
                    consumedMacros.proteinG,
                    targetMacros.proteinG
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-emerald-50/50 p-4 ring-1 ring-emerald-100">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
              <span>Carbohidratos</span>
              <span>
                {remainingVector.C >= 0
                  ? `Faltan ${remainingVector.C}g`
                  : 'Listo'}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-900">
                {consumedMacros.carbsG}g
              </span>
              <span className="text-xs text-slate-500">
                / {targetMacros.carbsG}g
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${pct(consumedMacros.carbsG, targetMacros.carbsG)}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-amber-50/60 p-4 ring-1 ring-amber-100">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900">
              <span>Grasas</span>
              <span>
                {remainingVector.G >= 0
                  ? `Faltan ${remainingVector.G}g`
                  : 'Listo'}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-900">
                {consumedMacros.fatG}g
              </span>
              <span className="text-xs text-slate-500">
                / {targetMacros.fatG}g
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{
                  width: `${pct(consumedMacros.fatG, targetMacros.fatG)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          CONTENIDO EN 2 COLUMNAS SIMPLES
         ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Columna Izquierda (7 cols): Añadir Alimento + Lo que comiste hoy */}
        <div className="space-y-6 lg:col-span-7">
          {/* 1. Añadir Alimento */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                1. Agregar una comida
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Gramos:</span>
                <input
                  type="number"
                  min={5}
                  max={1000}
                  step={5}
                  value={selectedFoodGrams}
                  onChange={(e) => setSelectedFoodGrams(Number(e.target.value))}
                  className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center text-sm font-bold text-slate-900"
                />
              </div>
            </div>

            {/* Botones de Momento del Día */}
            <div className="mb-4 flex flex-wrap gap-2">
              {QUICK_MEAL_SLOTS.map((slot) => {
                const isSelected = activeHourToLog === slot.hour;
                return (
                  <button
                    key={slot.hour}
                    type="button"
                    onClick={() => setActiveHourToLog(slot.hour)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>

            {/* Buscador */}
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={foodQuery}
                  onChange={(e) => setFoodQuery(e.target.value)}
                  placeholder="Buscar pollo, huevos, arroz, avena, yogur..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3 pl-10 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleSearchOpenFoodFacts}
                disabled={offLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <Globe className="h-4 w-4 text-blue-600" />
                <span>{offLoading ? 'Buscando...' : 'Más alimentos'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCustomFoodOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                <Plus className="h-4 w-4" />
                <span>Crear alimento</span>
              </button>
            </div>

            {isCustomFoodOpen && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!customFoodName.trim() || customKcal100 === '') return;
                  const newFood: FoodItem = {
                    id: `custom-${Date.now()}`,
                    name: customFoodName.trim(),
                    kcalPer100g: Number(customKcal100) || 0,
                    proteinPer100g: Number(customProtein100) || 0,
                    carbsPer100g: Number(customCarbs100) || 0,
                    fatPer100g: Number(customFat100) || 0,
                    fiberPer100g: 0,
                    defaultServingName: `Porción ${customServingGrams}g`,
                    defaultServingGrams: customServingGrams || 100,
                    isCustom: true,
                    isFavorite: true,
                  };
                  addCustomFood(newFood);
                  const preview = calculateFoodItemMacros(
                    newFood,
                    newFood.defaultServingGrams
                  );
                  addTimelineLog({
                    date: selectedDate,
                    hour: activeHourToLog,
                    foodId: newFood.id,
                    customLabel: newFood.name,
                    gramsConsumed: newFood.defaultServingGrams,
                    overrideMacros: preview,
                  });
                  setCustomFoodName('');
                  setCustomKcal100('');
                  setCustomProtein100('');
                  setCustomCarbs100('');
                  setCustomFat100('');
                  setIsCustomFoodOpen(false);
                }}
                className="mt-3 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4"
              >
                <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                  <span>Nuevo alimento personalizado (valores cada 100g)</span>
                  <button
                    type="button"
                    onClick={() => setIsCustomFoodOpen(false)}
                    className="text-slate-500 hover:text-slate-800"
                  >
                    Cerrar
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <input
                    type="text"
                    required
                    value={customFoodName}
                    onChange={(e) => setCustomFoodName(e.target.value)}
                    placeholder="Nombre del alimento..."
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 sm:col-span-2"
                  />
                  <input
                    type="number"
                    min={5}
                    value={customServingGrams}
                    onChange={(e) =>
                      setCustomServingGrams(Number(e.target.value))
                    }
                    placeholder="Porción (g)"
                    title="Gramos por porción"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    value={customKcal100}
                    onChange={(e) =>
                      setCustomKcal100(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    placeholder="Kcal / 100g"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={customProtein100}
                    onChange={(e) =>
                      setCustomProtein100(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    placeholder="Proteína (g)"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={customCarbs100}
                    onChange={(e) =>
                      setCustomCarbs100(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    placeholder="Carbos (g)"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={customFat100}
                    onChange={(e) =>
                      setCustomFat100(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    placeholder="Grasas (g)"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Guardar y añadir a mi comida de hoy
                </button>
              </form>
            )}

            {/* Lista de Alimentos */}
            <div className="mt-4 space-y-2">
              {[...offResults, ...filteredLocalFoods].map((f) => {
                const defaultPreview = calculateFoodItemMacros(
                  f,
                  f.defaultServingGrams
                );
                const customPreview = calculateFoodItemMacros(
                  f,
                  selectedFoodGrams
                );

                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm transition hover:border-slate-200 hover:bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-slate-900">
                        {f.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {f.defaultServingName} ({f.defaultServingGrams}g) ·{' '}
                        <strong className="text-slate-700">
                          {defaultPreview.kcal} kcal
                        </strong>{' '}
                        · {defaultPreview.proteinG}g proteína
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (!foodsMap[f.id]) addCustomFood(f);
                          addTimelineLog({
                            date: selectedDate,
                            hour: activeHourToLog,
                            foodId: f.id,
                            customLabel: f.name,
                            gramsConsumed: f.defaultServingGrams,
                            overrideMacros: defaultPreview,
                          });
                        }}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-500"
                      >
                        + {f.defaultServingGrams}g
                      </button>

                      {selectedFoodGrams !== f.defaultServingGrams && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!foodsMap[f.id]) addCustomFood(f);
                            addTimelineLog({
                              date: selectedDate,
                              hour: activeHourToLog,
                              foodId: f.id,
                              customLabel: f.name,
                              gramsConsumed: selectedFoodGrams,
                              overrideMacros: customPreview,
                            });
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          + {selectedFoodGrams}g
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Lo que comiste hoy */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Clock className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">
                  2. Lo que registraste hoy
                </h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {dayLogs.length} alimentos
              </span>
            </div>

            {selectedLogIdsForPaste.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-blue-50 p-3.5 text-xs ring-1 ring-blue-200">
                <span className="font-bold text-blue-900">
                  {selectedLogIdsForPaste.length} seleccionados para copiar
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={targetPasteDate}
                    onChange={(e) => setTargetPasteDate(e.target.value)}
                    className="rounded-xl border border-blue-200 bg-white px-2.5 py-1 text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleMultiPaste}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-500"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar</span>
                  </button>
                </div>
              </div>
            )}

            {pasteFeedback && (
              <div className="mb-4 rounded-2xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                {pasteFeedback}
              </div>
            )}

            {loggedHours.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <Utensils className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-2 text-sm font-bold text-slate-700">
                  Aún no agregaste comidas hoy
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Toca cualquier botón "+ Añadir" de arriba para empezar.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {loggedHours.map((hour) => {
                  const logsInHour = dayLogs.filter((l) => l.hour === hour);
                  const hourKcal = logsInHour.reduce(
                    (s, i) => s + i.calculatedMacros.kcal,
                    0
                  );

                  return (
                    <div
                      key={hour}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="mb-2.5 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          {getHourFriendlyLabel(hour)} ({String(hour).padStart(2, '0')}:00)
                        </span>
                        <span className="font-bold text-slate-600">
                          {hourKcal} kcal
                        </span>
                      </div>

                      <div className="space-y-2">
                        {logsInHour.map((log) => {
                          const foodName =
                            log.customLabel ||
                            (log.foodId && foodsMap[log.foodId]?.name) ||
                            'Comida';
                          const checked = selectedLogIdsForPaste.includes(
                            log.id
                          );

                          return (
                            <div
                              key={log.id}
                              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm shadow-2xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedLogIdsForPaste((prev) =>
                                      checked
                                        ? prev.filter((id) => id !== log.id)
                                        : [...prev, log.id]
                                    )
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-bold text-slate-900">
                                    {foodName}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {log.calculatedMacros.kcal} kcal ·{' '}
                                    {log.calculatedMacros.proteinG}g proteína
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <input
                                  type="number"
                                  min={5}
                                  step={5}
                                  value={log.gramsConsumed}
                                  onChange={(e) =>
                                    updateTimelineLogGrams(
                                      log.id,
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center text-xs font-bold text-slate-900"
                                />
                                <span className="text-xs text-slate-500">g</span>
                                <button
                                  type="button"
                                  onClick={() => removeTimelineLog(log.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600"
                                  title="Quitar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha (5 cols): Sugerencias Simples para Completar el Día */}
        <div className="space-y-6 lg:col-span-5">
          {/* Sugerencias Rápidas */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Ideas para completar tu día
                </h2>
                <p className="text-xs text-slate-500">
                  Porciones exactas según lo que te falta comer hoy
                </p>
              </div>
            </div>

            {bridgeSuggestions.length === 0 ? (
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                ¡Excelente! Ya completaste tus nutrientes de hoy.
              </div>
            ) : (
              <div className="space-y-3">
                {bridgeSuggestions.map((sug, idx) => (
                  <div
                    key={sug.id}
                    className={`rounded-2xl border p-4 ${
                      idx === 0
                        ? 'border-emerald-300 bg-emerald-50/40'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold text-slate-900">
                          {sug.title}
                        </span>
                        <div className="mt-1 text-xs font-medium text-slate-600">
                          {sug.totalMacros.kcal} kcal ·{' '}
                          <span className="text-blue-700">
                            {sug.totalMacros.proteinG}g proteína
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          for (const item of sug.items) {
                            addTimelineLog({
                              date: selectedDate,
                              hour: activeHourToLog,
                              foodId: item.food.id,
                              customLabel: item.food.name,
                              gramsConsumed: item.grams,
                              overrideMacros: item.macros,
                            });
                          }
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-500"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Sumar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recetas Fáciles */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <ChefHat className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Recetas listas para ti
                </h2>
                <p className="text-xs text-slate-500">
                  Cantidades adaptadas a tus calorías de hoy
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {scaledRecipes.map((sr) => (
                <div
                  key={sr.recipe.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-bold text-slate-900">
                        {sr.recipe.name}
                      </span>
                      <div className="mt-0.5 text-xs font-semibold text-slate-600">
                        {sr.scaledTotalMacros.kcal} kcal ·{' '}
                        {sr.scaledTotalMacros.proteinG}g proteína
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        addTimelineLog({
                          date: selectedDate,
                          hour: activeHourToLog,
                          recipeId: sr.recipe.id,
                          customLabel: sr.recipe.name,
                          gramsConsumed: sr.scaledTotalMacros.totalGrams,
                          overrideMacros: sr.scaledTotalMacros,
                        })
                      }
                      className="shrink-0 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
                    >
                      + Añadir
                    </button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs text-slate-600">
                    {sr.scaledIngredients.map((ing) => (
                      <span
                        key={ing.foodId}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-medium"
                      >
                        {ing.scaledGrams}g {ing.foodName.split('(')[0].trim()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
