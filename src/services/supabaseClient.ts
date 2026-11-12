import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { envConfig } from '../config/env';

/**
 * Instancia única (Singleton) del cliente de Supabase.
 * Si las variables de entorno aún no están configuradas, retorna null de forma segura
 * para permitir el uso local sin romper la aplicación.
 */
export const supabase: SupabaseClient | null = envConfig.isCloudConfigured
  ? createClient(envConfig.supabaseUrl, envConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'fitnutricion-auth-token',
      },
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
