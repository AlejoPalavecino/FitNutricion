import { clear as clearIdb } from 'idb-keyval';

/**
 * Servicio de seguridad de la aplicación:
 * - Sanitización de entradas de usuario
 * - Validación de políticas de contraseñas
 * - Enmascaramiento de errores técnicos para no filtrar detalles internos
 * - Limpieza segura de datos biométricos y nutricionales al cerrar sesión
 */

export interface PasswordValidationResult {
  isValid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  feedback: string;
}

/**
 * Limpia texto libre de etiquetas HTML o caracteres de control peligrosos.
 */
export function sanitizeText(input: string, maxLength = 120): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Normaliza y valida formato de correo electrónico.
 */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}

export function isValidEmail(email: string): boolean {
  const clean = sanitizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

/**
 * Evalúa la seguridad de la contraseña sin exponer reglas internas complejas.
 */
export function validatePasswordPolicy(password: string): PasswordValidationResult {
  if (!password || password.length < 8) {
    return {
      isValid: false,
      score: 1,
      feedback: 'Usa al menos 8 caracteres.',
    };
  }

  let score = 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;

  const clampedScore = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;

  if (clampedScore < 2) {
    return {
      isValid: false,
      score: clampedScore,
      feedback: 'Agrega letras y números para mayor seguridad.',
    };
  }

  return {
    isValid: true,
    score: clampedScore,
    feedback: clampedScore >= 3 ? 'Contraseña segura' : 'Contraseña válida',
  };
}

/**
 * Traduce errores técnicos de red/autenticación a mensajes seguros para el usuario
 * sin exponer detalles internos de la base de datos o del servidor.
 */
export function mapSafeAuthError(error: unknown): string {
  const rawMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (
    rawMessage.includes('invalid login credentials') ||
    rawMessage.includes('credenciales')
  ) {
    return 'El correo o la contraseña no son correctos. Verifica tus datos.';
  }
  if (rawMessage.includes('already registered') || rawMessage.includes('ya existe')) {
    return 'Este correo ya tiene una cuenta registrada. Intenta iniciar sesión.';
  }
  if (rawMessage.includes('rate limit') || rawMessage.includes('too many requests')) {
    return 'Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.';
  }
  if (rawMessage.includes('network') || rawMessage.includes('fetch')) {
    return 'No pudimos conectar con el servidor. Revisa tu conexión a internet.';
  }
  return 'No se pudo completar la operación en este momento. Intenta nuevamente.';
}

/**
 * Borra de forma segura los datos sensibles almacenados localmente en el dispositivo
 * cuando el usuario cierra su sesión (evita exponer peso, medidas o comidas en equipos compartidos).
 */
export async function clearSensitiveUserStorage(): Promise<void> {
  const sensitiveKeys = [
    'fitnutricion-offline-v1',
    'fitnutricion-offline-store-v2',
    'fitnutricion-local-session-v1',
  ];

  try {
    if (typeof localStorage !== 'undefined') {
      for (const key of sensitiveKeys) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignorar restricciones del navegador
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  } catch {
    // Ignorar restricciones del navegador
  }

  try {
    if (typeof indexedDB !== 'undefined') {
      await clearIdb();
    }
  } catch {
    // Ignorar si IndexedDB no está disponible
  }
}
