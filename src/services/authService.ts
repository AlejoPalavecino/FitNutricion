import {
  createLocalCredential,
  verifyLegacyCredential,
  verifyLocalCredential,
  type LocalCredential,
} from './localCredentials';
import {
  clearSensitiveUserStorage,
  isValidEmail,
  mapSafeAuthError,
  sanitizeEmail,
  sanitizeText,
  validatePasswordPolicy,
} from './securityService';
import { supabase } from './supabaseClient';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  authMode: 'cloud' | 'local_vault';
}

export interface AuthOperationResult {
  success: boolean;
  user?: AuthenticatedUser;
  errorMessage?: string;
  requiresEmailConfirmation?: boolean;
}

interface LocalVaultUserRecord {
  id: string;
  email: string;
  fullName: string;
  passwordHashHex?: string;
  credential?: LocalCredential;
  createdAt: string;
}

const LOCAL_VAULT_ACCOUNTS_KEY = 'fitnutricion-vault-accounts-v1';
const LOCAL_ACTIVE_SESSION_KEY = 'fitnutricion-local-session-v1';

function readLocalAccounts(): LocalVaultUserRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_VAULT_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) =>
            entry &&
            typeof entry.id === 'string' &&
            typeof entry.email === 'string' &&
            typeof entry.fullName === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: LocalVaultUserRecord[]): void {
  // Never report registration success when the account could not be persisted.
  localStorage.setItem(LOCAL_VAULT_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export const authService = {
  /**
   * Obtiene la sesión activa actual (desde Supabase Cloud o sesión local autenticada).
   */
  async getCurrentUser(): Promise<AuthenticatedUser | null> {
    if (supabase) {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.user) return null;
      const u = data.session.user;
      return {
        id: u.id,
        email: u.email ?? '',
        fullName: sanitizeText(
          String(u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'Usuario'),
        ),
        authMode: 'cloud',
      };
    }

    try {
      const rawSession = localStorage.getItem(LOCAL_ACTIVE_SESSION_KEY);
      if (!rawSession) return null;
      const parsed = JSON.parse(rawSession) as AuthenticatedUser;
      if (
        parsed?.id &&
        parsed?.email &&
        parsed.authMode === 'local_vault' &&
        readLocalAccounts().some(
          (account) => account.id === parsed.id && account.email === parsed.email,
        )
      ) {
        return { ...parsed, fullName: sanitizeText(parsed.fullName) };
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Registra un nuevo usuario validando correo, nombre y política de contraseña.
   */
  async registerWithEmail(params: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<AuthOperationResult> {
    const cleanName = sanitizeText(params.fullName, 80);
    const cleanEmail = sanitizeEmail(params.email);

    if (!cleanName || cleanName.length < 2) {
      return {
        success: false,
        errorMessage: 'Ingresa tu nombre para personalizar tu cuenta.',
      };
    }

    if (!isValidEmail(cleanEmail)) {
      return {
        success: false,
        errorMessage: 'Ingresa un correo electrónico válido.',
      };
    }

    const pwdCheck = validatePasswordPolicy(params.password);
    if (!pwdCheck.isValid) {
      return {
        success: false,
        errorMessage: pwdCheck.feedback,
      };
    }

    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: params.password,
        options: {
          data: {
            full_name: cleanName,
          },
        },
      });

      if (error) {
        return {
          success: false,
          errorMessage: mapSafeAuthError(error),
        };
      }

      if (data.user && !data.session) {
        return {
          success: true,
          requiresEmailConfirmation: true,
        };
      }

      if (data.user) {
        return {
          success: true,
          user: {
            id: data.user.id,
            email: data.user.email ?? cleanEmail,
            fullName: cleanName,
            authMode: 'cloud',
          },
        };
      }
    }

    // Modo local: credenciales derivadas; datos del dispositivo NO cifrados.
    const accounts = readLocalAccounts();
    if (accounts.some((acc) => acc.email === cleanEmail)) {
      return {
        success: false,
        errorMessage: 'Este correo ya tiene una cuenta registrada. Inicia sesión.',
      };
    }

    const credential = await createLocalCredential(params.password);
    const newUser: LocalVaultUserRecord = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `user-${Date.now()}`,
      email: cleanEmail,
      fullName: cleanName,
      credential,
      createdAt: new Date().toISOString(),
    };

    writeLocalAccounts([...accounts, newUser]);

    const sessionUser: AuthenticatedUser = {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      authMode: 'local_vault',
    };

    localStorage.setItem(LOCAL_ACTIVE_SESSION_KEY, JSON.stringify(sessionUser));

    return {
      success: true,
      user: sessionUser,
    };
  },

  /**
   * Inicia sesión verificando credenciales de forma segura.
   */
  async loginWithEmail(params: { email: string; password: string }): Promise<AuthOperationResult> {
    const cleanEmail = sanitizeEmail(params.email);

    if (!isValidEmail(cleanEmail) || !params.password) {
      return {
        success: false,
        errorMessage: 'Ingresa tu correo electrónico y tu contraseña.',
      };
    }

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: params.password,
      });

      if (error || !data.user) {
        return {
          success: false,
          errorMessage: mapSafeAuthError(error ?? new Error('invalid login credentials')),
        };
      }

      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email ?? cleanEmail,
          fullName: sanitizeText(
            String(
              data.user.user_metadata?.full_name ?? data.user.email?.split('@')[0] ?? 'Usuario',
            ),
          ),
          authMode: 'cloud',
        },
      };
    }

    const accounts = readLocalAccounts();
    const matched = accounts.find((account) => account.email === cleanEmail);
    const valid =
      matched &&
      (matched.credential
        ? await verifyLocalCredential(params.password, matched.credential)
        : await verifyLegacyCredential(cleanEmail, params.password, matched.passwordHashHex ?? ''));

    if (!matched || !valid) {
      return {
        success: false,
        errorMessage: 'El correo o la contraseña no son correctos. Verifica tus datos.',
      };
    }

    if (!matched.credential) {
      matched.credential = await createLocalCredential(params.password);
      delete matched.passwordHashHex;
      writeLocalAccounts(accounts);
    }

    const sessionUser: AuthenticatedUser = {
      id: matched.id,
      email: matched.email,
      fullName: matched.fullName,
      authMode: 'local_vault',
    };

    localStorage.setItem(LOCAL_ACTIVE_SESSION_KEY, JSON.stringify(sessionUser));

    return {
      success: true,
      user: sessionUser,
    };
  },

  /**
   * Cierra la sesión y limpia los datos sensibles del dispositivo.
   */
  async logout(wipeLocalHealthCache = false): Promise<void> {
    const user = await this.getCurrentUser();
    if (wipeLocalHealthCache && user) await clearSensitiveUserStorage(user.id);
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }
    localStorage.removeItem(LOCAL_ACTIVE_SESSION_KEY);
  },
};
