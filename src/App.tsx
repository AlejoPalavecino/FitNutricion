import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Check,
  Dumbbell,
  LogOut,
  Plus,
  RotateCcw,
  Scale,
  Search,
  SlidersHorizontal,
  Utensils,
} from 'lucide-react';
import { useNutritionStore } from './store/useNutritionStore';
import { useAuthStore } from './store/useAuthStore';
import { AuthScreen } from './components/auth/AuthScreen';
import { OnboardingDiagnostic } from './components/onboarding/OnboardingDiagnostic';
import { BiometricCheckinView } from './components/onboarding/BiometricCheckinView';
import { NutritionDashboard } from './components/dashboard/NutritionDashboard';
import { OpenGymHub } from './components/gym/OpenGymHub';
import {
  QuickActionCommand,
  type MainAppTab,
} from './components/navigation/QuickActionCommand';

const PHASE_NAMES_SIMPLE: Record<string, string> = {
  cut: 'Bajar Grasa',
  recomp: 'Recomposición',
  maintenance: 'Mantener Peso',
  bulk: 'Ganar Músculo',
};

export function App() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const initializeAuth = useAuthStore((s) => s.initializeAuth);
  const logout = useAuthStore((s) => s.logout);

  const userProfile = useNutritionStore((s) => s.userProfile);
  const biometricLogs = useNutritionStore((s) => s.biometricLogs);
  const timelineLogs = useNutritionStore((s) => s.timelineLogs);
  const workoutSessions = useNutritionStore((s) => s.workoutSessions);
  const selectedDate = useNutritionStore((s) => s.selectedDate);
  const addOrUpdateBiometricLog = useNutritionStore(
    (s) => s.addOrUpdateBiometricLog
  );
  const resetStoreToOnboarding = useNutritionStore(
    (s) => s.resetStoreToOnboarding
  );

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  const [activeTab, setActiveTab] = useState<MainAppTab>(
    userProfile?.onboardingCompleted ? 'gym' : 'onboarding'
  );
  const hasAutoRedirected = useRef(Boolean(userProfile?.onboardingCompleted));

  useEffect(() => {
    if (userProfile?.onboardingCompleted && !hasAutoRedirected.current) {
      hasAutoRedirected.current = true;
      setActiveTab('gym');
    }
  }, [userProfile?.onboardingCompleted]);

  const [isQuickCommandOpen, setIsQuickCommandOpen] = useState(false);
  const [isWeightPopoverOpen, setIsWeightPopoverOpen] = useState(false);

  const latestBio = useMemo(() => {
    if (biometricLogs.length === 0) return undefined;
    return [...biometricLogs].sort((a, b) => a.date.localeCompare(b.date))[
      biometricLogs.length - 1
    ];
  }, [biometricLogs]);

  const [headerWeightInput, setHeaderWeightInput] = useState<number>(
    latestBio?.scaleWeightKg ?? 80
  );
  const [weightSavedToast, setWeightSavedToast] = useState(false);

  useEffect(() => {
    if (latestBio?.scaleWeightKg) {
      setHeaderWeightInput(latestBio.scaleWeightKg);
    }
  }, [latestBio?.scaleWeightKg]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsQuickCommandOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsQuickCommandOpen(false);
        setIsWeightPopoverOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const todayStats = useMemo(() => {
    const logsToday = timelineLogs.filter((l) => l.date === selectedDate);
    const consumedKcal = logsToday.reduce(
      (sum, item) => sum + item.calculatedMacros.kcal,
      0
    );
    const consumedProtein = Math.round(
      logsToday.reduce((sum, item) => sum + item.calculatedMacros.proteinG, 0)
    );
    const targetKcal = userProfile?.targetKcal ?? 2400;
    const targetProtein = userProfile?.targetProteinG ?? 175;
    const remainingProtein = Math.max(0, targetProtein - consumedProtein);

    const sessionsToday = workoutSessions.filter(
      (s) => s.date === selectedDate
    );
    const setsToday = sessionsToday.reduce((sum, s) => sum + s.sets.length, 0);

    return {
      consumedKcal,
      targetKcal,
      remainingProtein,
      sessionsTodayCount: sessionsToday.length,
      setsToday,
    };
  }, [timelineLogs, workoutSessions, selectedDate, userProfile]);

  const handleQuickSaveWeight = (e: React.FormEvent) => {
    e.preventDefault();
    addOrUpdateBiometricLog({ scaleWeightKg: headerWeightInput });
    setWeightSavedToast(true);
    setTimeout(() => {
      setWeightSavedToast(false);
      setIsWeightPopoverOpen(false);
    }, 1000);
  };

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500">
        Cargando tu sesión segura...
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ====================================================================
          BARRA SUPERIOR CLARA, LIMPIA Y FÁCIL DE ENTENDER
         ==================================================================== */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Logo y Objetivo Actual */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab(userProfile ? 'gym' : 'onboarding')}
              className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:scale-105 hover:border-emerald-300"
              title="FitNutrición"
            >
              <img
                src="/logo.jpg"
                alt="Logo FitNutrición"
                className="h-full w-full object-cover"
              />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-slate-900">
                  FitNutrición
                </span>
                {userProfile && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('onboarding')}
                    className="rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                  >
                    {PHASE_NAMES_SIMPLE[userProfile.currentPhase] ?? 'Activo'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Buscador Rápido + Botón de Peso en 2 clics */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:justify-center md:max-w-md">
            <button
              type="button"
              onClick={() => setIsQuickCommandOpen(true)}
              className="flex w-full max-w-xs items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500 transition hover:border-emerald-400 hover:bg-white hover:text-slate-800 sm:max-w-sm"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="truncate">Buscar comida o ejercicio...</span>
              </span>
            </button>

            {userProfile && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsWeightPopoverOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-2xs transition hover:border-emerald-400 hover:text-emerald-700"
                  title="Anotar mi peso de hoy"
                >
                  <Scale className="h-4 w-4 text-emerald-600" />
                  <span>
                    {latestBio
                      ? `${latestBio.scaleWeightKg.toFixed(1)} kg`
                      : 'Peso'}
                  </span>
                </button>

                {isWeightPopoverOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">
                        Tu peso de hoy
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsWeightPopoverOpen(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        Cerrar
                      </button>
                    </div>
                    <form
                      onSubmit={handleQuickSaveWeight}
                      className="space-y-2.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setHeaderWeightInput((w) =>
                              Number((w - 0.2).toFixed(1))
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          -0.2
                        </button>
                        <input
                          type="number"
                          step={0.1}
                          value={headerWeightInput}
                          onChange={(e) =>
                            setHeaderWeightInput(Number(e.target.value))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-base font-bold text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setHeaderWeightInput((w) =>
                              Number((w + 0.2).toFixed(1))
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          +0.2
                        </button>
                      </div>
                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-emerald-500"
                      >
                        {weightSavedToast ? (
                          <>
                            <Check className="h-4 w-4" />
                            <span>¡Guardado!</span>
                          </>
                        ) : (
                          <span>Guardar peso</span>
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4 Pestañas Principales Grandes y Legibles */}
          <nav className="hidden items-center gap-1.5 md:flex">
            <button
              type="button"
              onClick={() => setActiveTab('gym')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                activeTab === 'gym'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Dumbbell className="h-4 w-4" />
              <span>Entrenar</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('nutrition')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                activeTab === 'nutrition'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Utensils className="h-4 w-4" />
              <span>Comidas</span>
            </button>

            <button
              type="button"
              disabled={!userProfile}
              onClick={() => setActiveTab('biometrics')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                !userProfile
                  ? 'cursor-not-allowed text-slate-300'
                  : activeTab === 'biometrics'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>Mi Peso</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('onboarding')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                activeTab === 'onboarding'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Mi Plan</span>
            </button>

            {userProfile && (
              <button
                type="button"
                onClick={() => {
                  resetStoreToOnboarding();
                  hasAutoRedirected.current = false;
                  setActiveTab('onboarding');
                }}
                title="Reiniciar datos de prueba"
                className="ml-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                void logout(false);
              }}
              title={`Cerrar sesión (${currentUser.email})`}
              className="ml-1 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
              <span>Salir</span>
            </button>
          </nav>
        </div>

        {/* Resumen Rápido de Hoy (Limpio y Ligero) */}
        {userProfile && (
          <div className="border-t border-slate-100 bg-slate-50/80">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6 sm:text-sm">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <button
                  type="button"
                  onClick={() => setActiveTab('nutrition')}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
                >
                  <Utensils className="h-4 w-4 text-emerald-600" />
                  <span>
                    Comidas hoy:{' '}
                    <strong className="text-slate-900">
                      {todayStats.consumedKcal} / {todayStats.targetKcal} kcal
                    </strong>{' '}
                    <span className="text-slate-500">
                      (faltan {todayStats.remainingProtein}g de proteína)
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('gym')}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
                >
                  <Dumbbell className="h-4 w-4 text-indigo-600" />
                  <span>
                    Gimnasio:{' '}
                    <strong className="text-slate-900">
                      {todayStats.sessionsTodayCount > 0
                        ? `${todayStats.setsToday} series hechas hoy`
                        : 'Rutina lista para empezar'}
                    </strong>
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsQuickCommandOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-500"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Añadir rápido</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Contenido Principal */}
      <main className="pb-24">
        {activeTab === 'onboarding' && (
          <OnboardingDiagnostic
            isReconfiguring={Boolean(userProfile)}
            onCompleted={() => setActiveTab('gym')}
          />
        )}
        {activeTab === 'nutrition' && <NutritionDashboard />}
        {activeTab === 'gym' && <OpenGymHub />}
        {activeTab === 'biometrics' && (
          <BiometricCheckinView
            onOpenReconfigure={() => setActiveTab('onboarding')}
          />
        )}
      </main>

      {/* Barra Inferior para Móviles */}
      <nav className="fixed right-0 bottom-0 left-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 px-2 py-2 shadow-lg backdrop-blur-md md:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('gym')}
          className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-xs font-bold ${
            activeTab === 'gym' ? 'text-indigo-600' : 'text-slate-500'
          }`}
        >
          <Dumbbell className="h-5 w-5" />
          <span>Entrenar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('nutrition')}
          className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-xs font-bold ${
            activeTab === 'nutrition' ? 'text-emerald-600' : 'text-slate-500'
          }`}
        >
          <Utensils className="h-5 w-5" />
          <span>Comidas</span>
        </button>

        <button
          type="button"
          onClick={() => setIsQuickCommandOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md"
          title="Añadir rápido"
        >
          <Plus className="h-6 w-6" />
        </button>

        <button
          type="button"
          disabled={!userProfile}
          onClick={() => setActiveTab('biometrics')}
          className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-xs font-bold ${
            !userProfile
              ? 'text-slate-300'
              : activeTab === 'biometrics'
                ? 'text-blue-600'
                : 'text-slate-500'
          }`}
        >
          <Activity className="h-5 w-5" />
          <span>Mi Peso</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('onboarding')}
          className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-xs font-bold ${
            activeTab === 'onboarding' ? 'text-slate-900' : 'text-slate-500'
          }`}
        >
          <SlidersHorizontal className="h-5 w-5" />
          <span>Mi Plan</span>
        </button>
      </nav>

      {/* Buscador y Lanzador Rápido */}
      <QuickActionCommand
        isOpen={isQuickCommandOpen}
        onClose={() => setIsQuickCommandOpen(false)}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}

export default App;
