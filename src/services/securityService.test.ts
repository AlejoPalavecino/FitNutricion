import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  mapSafeAuthError,
  sanitizeEmail,
  sanitizeText,
  validatePasswordPolicy,
} from './securityService';

describe('securityService', () => {
  it('sanitiza texto eliminando etiquetas HTML peligrosas', () => {
    const dirty = '  <script>alert(1)</script>Alejandro  ';
    expect(sanitizeText(dirty)).toBe('scriptalert(1)/scriptAlejandro');
  });

  it('normaliza y valida correos electrónicos correctamente', () => {
    expect(sanitizeEmail('  Usuario@Dominio.COM ')).toBe('usuario@dominio.com');
    expect(isValidEmail('atleta@fitnutricion.app')).toBe(true);
    expect(isValidEmail('correo-invalido')).toBe(false);
  });

  it('valida fortaleza de contraseña sin exponer reglas internas', () => {
    expect(validatePasswordPolicy('12345').isValid).toBe(false);
    const strong = validatePasswordPolicy('FitNutricion2026!');
    expect(strong.isValid).toBe(true);
    expect(strong.score).toBe(4);
  });

  it('oculta errores internos de base de datos o red con mensajes seguros', () => {
    const rawDbError = new Error('Postgres error 23505: invalid login credentials');
    expect(mapSafeAuthError(rawDbError)).toBe(
      'El correo o la contraseña no son correctos. Verifica tus datos.',
    );
  });
});
