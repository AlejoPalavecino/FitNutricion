import { localDate, weekStart } from '../../lib/dates';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Plus,
  RefreshCw,
  Scale,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNutritionStore } from '../../store/useNutritionStore';

interface BiometricCheckinViewProps {
  onOpenReconfigure: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  cut: 'Bajar Grasa',
  recomp: 'Recomposición Corporal',
  bulk: 'Ganar Músculo',
  maintenance: 'Mantener Peso',
};

export const BiometricCheckinView: React.FC<BiometricCheckinViewProps> = ({
  onOpenReconfigure,
}) => {
  const timelineLogs = useNutritionStore(s=>s.timelineLogs);
  const completeDates = useNutritionStore(s=>s.completedNutritionDates);
  const checkins = useNutritionStore(s=>s.metabolicCheckins);
  const alreadyApplied = checkins.some(c=>weekStart(c.weekDate)===weekStart());
  const userProfile = useNutritionStore((s) => s.userProfile);
  const biometricLogs = useNutritionStore((s) => s.biometricLogs);
  const addOrUpdateBiometricLog = useNutritionStore(
    (s) => s.addOrUpdateBiometricLog
  );
  const computeCurrentAdaptiveTdeeStatus = useNutritionStore(
    (s) => s.computeCurrentAdaptiveTdeeStatus
  );
  const executeWeeklyMetabolicCheckin = useNutritionStore(
    (s) => s.executeWeeklyMetabolicCheckin
  );

  const sortedLogs = useMemo(
    () => [...biometricLogs].sort((a, b) => a.date.localeCompare(b.date)),
    [biometricLogs]
  );
  const latestLog = sortedLogs[sortedLogs.length - 1];

  const [logDate, setLogDate] = useState(() =>
    localDate()
  );
  const [scaleWeight, setScaleWeight] = useState<number>(
    latestLog?.scaleWeightKg ?? 70
  );
  const [checkinBanner, setCheckinBanner] = useState<string | null>(null);

  useEffect(() => {
    if (latestLog?.scaleWeightKg) {
      setScaleWeight(latestLog.scaleWeightKg);
    }
  }, [latestLog?.scaleWeightKg]);

  const adaptiveStatus = useMemo(
    () => computeCurrentAdaptiveTdeeStatus(),
    [computeCurrentAdaptiveTdeeStatus, biometricLogs, userProfile, timelineLogs, completeDates]
  );

  if (!userProfile) return null;

  const handlePeriodicControlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (logDate > localDate() || !Number.isFinite(scaleWeight) || scaleWeight < 30 || scaleWeight > 250) {
      return;
    }
    addOrUpdateBiometricLog({
      date: logDate,
      scaleWeightKg: scaleWeight,
    });
    setCheckinBanner(`Peso guardado (${scaleWeight.toFixed(1)} kg).`);
  };

  const handleApplyAdaptiveTdee = () => {
    const res = executeWeeklyMetabolicCheckin(true);
    if (res) {
      setCheckinBanner(
        `¡Meta actualizada! Tu gasto diario pasó de ${res.previousTdee} a ${res.appliedTdee} kcal.`
      );
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* Encabezado Simple */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
        <div>
          <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            Objetivo: {PHASE_LABELS[userProfile.currentPhase] ?? 'Activo'}
          </span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
            Evolución de tu Peso · {userProfile.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Calculamos tu promedio suavizado a partir de tus propios pesajes para filtrar las variaciones diarias de agua.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenReconfigure}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <Edit3 className="h-4 w-4 text-emerald-600" />
            <span>Cambiar mi objetivo</span>
          </button>
        </div>
      </div>

      {checkinBanner && (
        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{checkinBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setCheckinBanner(null)}
            className="text-xs font-bold text-emerald-700 hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* 3 Indicadores Claros y Grandes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Último Peso en Báscula
          </span>
          <div className="mt-1 text-3xl font-extrabold text-slate-900">
            {latestLog ? `${latestLog.scaleWeightKg.toFixed(1)} kg` : '—'}
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            Grasa estimada:{' '}
            {latestLog ? `${latestLog.estimatedBfPercent.toFixed(1)}%` : '—'}
          </span>
        </div>

        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            Tu Tendencia de Peso Estimada
          </span>
          <div className="mt-1 text-3xl font-extrabold text-emerald-700">
            {latestLog ? `${latestLog.trendWeightKg.toFixed(1)} kg` : '—'}
          </div>
          <span className="mt-1 block text-xs text-slate-600">
            Suavizado orientativo; no distingue agua de otros cambios
          </span>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Tu Meta Diaria Actual
          </span>
          <div className="mt-1 text-3xl font-extrabold text-slate-900">
            {userProfile.targetKcal}{' '}
            <span className="text-base font-semibold text-slate-500">kcal</span>
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            {userProfile.targetProteinG}g proteína · {userProfile.targetCarbsG}g
            carbos · {userProfile.targetFatG}g grasas
          </span>
        </div>
      </div>

      {/* Registro de Peso + Gráfica Limpia */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Registrar Peso */}
        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Anotar mi peso
                </h2>
                <p className="text-xs text-slate-500">
                  Pésate por la mañana y guárdalo en 1 clic
                </p>
              </div>
            </div>

            <form onSubmit={handlePeriodicControlSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Fecha
                </label>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Peso (kg)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setScaleWeight((w) => Number((w - 0.2).toFixed(1)))
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    -0.2
                  </button>
                  <input
                    type="number"
                    step={0.1}
                    min={30}
                    max={250}
                    value={scaleWeight}
                    onChange={(e) => setScaleWeight(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-lg font-extrabold text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setScaleWeight((w) => Number((w + 0.2).toFixed(1)))
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    +0.2
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" />
                <span>Guardar mi Peso</span>
              </button>
            </form>

            {/* Ajuste Semanal Automático */}
            {adaptiveStatus && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    Ajuste Automático de Calorías
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      adaptiveStatus.isReadyForAdaptive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {adaptiveStatus.isReadyForAdaptive
                      ? 'Listo'
                      : `${adaptiveStatus.loggedDaysCount} días registrados`}
                  </span>
                </div>

                {adaptiveStatus.isReadyForAdaptive ? (
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <p>
                      Según tu progreso real ({adaptiveStatus.weightSlopeKgPerWeek >= 0 ? '+' : ''}
                      {adaptiveStatus.weightSlopeKgPerWeek} kg/semana), el modelo estima un gasto de{' '}
                      <strong className="text-slate-900">
                        {adaptiveStatus.appliedTdee} kcal
                      </strong>{' '}
                      al día.
                    </p>
                    <button
                      type="button"
                      onClick={handleApplyAdaptiveTdee}
                      disabled={alreadyApplied}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-500"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>{alreadyApplied ? 'Revisión semanal ya registrada' : 'Actualizar mis calorías de la semana'}</span>
                    </button>
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Registra tu peso y comidas durante al menos 2 semanas para que el motor calcule y ajuste tus calorías estimadas con tu confirmación.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Gráfica Clara e Historial Real */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Gráfica de tu Progreso
                </h2>
                <p className="text-xs text-slate-500">
                  La línea verde muestra tu tendencia estimada; la gris es el peso de la báscula cada día
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {sortedLogs.length}{' '}
                {sortedLogs.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>

            {sortedLogs.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <Scale className="h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-bold text-slate-700">
                  Aún no hay pesajes registrados
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Usa el formulario de la izquierda para guardar tu primer peso.
                </p>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sortedLogs}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(val: string) => val.slice(5)}
                      stroke="#64748b"
                      fontSize={12}
                    />
                    <YAxis
                      domain={['dataMin - 0.6', 'dataMax + 0.6']}
                      stroke="#64748b"
                      fontSize={12}
                      tickFormatter={(v: number) => `${v.toFixed(1)}kg`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '14px',
                        fontSize: '13px',
                        color: '#0f172a',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="scaleWeightKg"
                      name="Peso en Báscula"
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#94a3b8' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="trendWeightKg"
                      name="Tendencia de peso (estimada)"
                      stroke="#059669"
                      strokeWidth={3.5}
                      dot={{ r: 3.5, fill: '#059669' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
