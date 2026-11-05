import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { validatePasswordPolicy } from '../../services/securityService';

export const AuthScreen: React.FC = () => {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const isCloudActive = useAuthStore((s) => s.isCloudActive);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const passwordCheck = useMemo(
    () => validatePasswordPolicy(password),
    [password]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setErrorMessage('Las contraseñas no coinciden.');
        return;
      }

      const res = await register(fullName, email, password);
      if (!res.success) {
        setErrorMessage(res.errorMessage ?? 'No se pudo crear la cuenta.');
        return;
      }

      if (res.requiresEmailConfirmation) {
        setInfoMessage(
          '¡Cuenta creada! Revisa tu correo electrónico para confirmar tu acceso.'
        );
        setMode('login');
      }
      return;
    }

    const res = await login(email, password);
    if (!res.success) {
      setErrorMessage(res.errorMessage ?? 'No se pudo iniciar sesión.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo y Marca */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-1.5 shadow-md">
            <img
              src="/logo.jpg"
              alt="Logo FitNutrición"
              className="h-full w-full rounded-2xl object-cover"
            />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
            FitNutrición
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Tu guía simple y privada de entrenamiento, comidas y progreso
          </p>
        </div>

        {/* Tarjeta Principal de Login / Registro */}
        <div className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {/* Selector de Pestaña */}
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className={`rounded-xl py-2.5 text-sm font-bold transition ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className={`rounded-xl py-2.5 text-sm font-bold transition ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Crear Cuenta
            </button>
          </div>

          {errorMessage && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
              {errorMessage}
            </div>
          )}

          {infoMessage && (
            <div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{infoMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Tu nombre
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pr-4 pl-10 text-sm font-medium text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pr-4 pl-10 text-sm font-medium text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pr-11 pl-10 text-sm font-medium text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-3 right-3 rounded-lg p-1 text-slate-400 hover:text-slate-700"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Indicador visual de seguridad al registrarse */}
              {mode === 'register' && password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1.5 flex-1 rounded-full transition-all ${
                          passwordCheck.score >= level
                            ? passwordCheck.score >= 3
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">
                    {passwordCheck.feedback}
                  </p>
                </div>
              )}
            </div>

            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Repetir contraseña
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite tu contraseña"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pr-4 pl-10 text-sm font-medium text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <span>
                {isSubmitting
                  ? 'Verificando...'
                  : mode === 'login'
                  ? 'Entrar a mi cuenta'
                  : 'Crear mi cuenta segura'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Sello de Privacidad y Seguridad */}
        <div className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            {isCloudActive
              ? 'Conectado a Supabase Cloud con protección RLS por usuario'
              : 'Datos protegidos con cifrado SHA-256 y aislamiento de sesión'}
          </span>
        </div>
      </div>
    </div>
  );
};
