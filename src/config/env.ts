export interface AppEnvironmentConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly appEnv: 'development' | 'production' | 'test';
  readonly authMode: 'local' | 'cloud';
  readonly isCloudConfigured: boolean;
  readonly configurationError: string | null;
}
export function parseEnvironment(
  values: Record<string, unknown>,
  production = false,
): AppEnvironmentConfig {
  const text = (key: string) =>
    typeof values[key] === 'string' ? (values[key] as string).trim() : '';
  const mode = text('VITE_AUTH_MODE');
  const authMode = mode === 'cloud' ? 'cloud' : 'local';
  const supabaseUrl = text('VITE_SUPABASE_URL')
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
  const supabaseAnonKey = text('VITE_SUPABASE_ANON_KEY');
  let configurationError: string | null = null;
  let validUrl = false;
  try {
    const u = new URL(supabaseUrl);
    validUrl =
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.hostname.includes('tu-proyecto-id');
  } catch {
    validUrl = false;
  }
  let privileged = supabaseAnonKey.startsWith('sb_secret_');
  try {
    const payload = JSON.parse(
      atob(supabaseAnonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    privileged ||= payload.role === 'service_role';
  } catch {
    /* Publishable keys are not JWTs. */
  }
  if ((production && !mode) || (mode && mode !== 'local' && mode !== 'cloud'))
    configurationError = 'Configura VITE_AUTH_MODE explícitamente como local o cloud.';
  if (authMode === 'cloud' && (!validUrl || supabaseAnonKey.length < 21 || privileged))
    configurationError =
      'Configuración de nube inválida. Usa HTTPS y una clave pública; nunca una clave privilegiada.';
  return {
    supabaseUrl,
    supabaseAnonKey,
    authMode,
    appEnv: values.MODE === 'test' ? 'test' : production ? 'production' : 'development',
    configurationError,
    isCloudConfigured: authMode === 'cloud' && !configurationError,
  };
}
export const envConfig = Object.freeze(parseEnvironment(import.meta.env, import.meta.env.PROD));
