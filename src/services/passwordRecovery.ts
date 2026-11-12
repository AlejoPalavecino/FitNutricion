import {
  isValidEmail,
  mapSafeAuthError,
  sanitizeEmail,
  validatePasswordPolicy,
} from './securityService';
import { supabase } from './supabaseClient';
export async function requestPasswordRecovery(email: string): Promise<string> {
  if (!supabase) throw new Error('Las cuentas locales no tienen recuperación por correo.');
  if (!isValidEmail(email)) throw new Error('Ingresa un correo válido.');
  const { error } = await supabase.auth.resetPasswordForEmail(sanitizeEmail(email), {
    redirectTo: window.location.origin + '/?recovery=1',
  });
  if (error) throw new Error(mapSafeAuthError(error));
  return 'Si existe una cuenta, recibirás instrucciones en tu correo.';
}
export async function replaceRecoveredPassword(password: string): Promise<void> {
  if (!supabase) throw new Error('La recuperación requiere una cuenta cloud.');
  const check = validatePasswordPolicy(password);
  if (!check.isValid) throw new Error(check.feedback);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(mapSafeAuthError(error));
}
