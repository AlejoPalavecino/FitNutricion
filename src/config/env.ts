/**
 * Configuración centralizada y validada de variables de entorno.
 * Nunca expone ni registra claves privadas en consola.
 */

interface AppEnvironmentConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly appEnv: 'development' | 'production' | 'test';
  readonly isCloudConfigured: boolean;
}

function readEnvVar(key: string): string {
  const raw = import.meta.env?.[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function normalizeSupabaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(readEnvVar('VITE_SUPABASE_URL'));
const supabaseAnonKey = readEnvVar('VITE_SUPABASE_ANON_KEY');
const rawAppEnv = readEnvVar('VITE_APP_ENV');

const isValidSupabaseUrl =
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('tu-proyecto-id.supabase.co');

const isValidAnonKey =
  supabaseAnonKey.length > 20 &&
  supabaseAnonKey !== 'tu_clave_publica_anon_de_supabase';

export const envConfig: AppEnvironmentConfig = Object.freeze({
  supabaseUrl,
  supabaseAnonKey,
  appEnv:
    rawAppEnv === 'production' || rawAppEnv === 'test'
      ? rawAppEnv
      : 'development',
  isCloudConfigured: isValidSupabaseUrl && isValidAnonKey,
});
