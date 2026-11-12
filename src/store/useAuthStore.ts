import { create } from 'zustand';
import {
  authService,
  type AuthenticatedUser,
  type AuthOperationResult,
} from '../services/authService';
import { cloudSyncService } from '../services/cloudSyncService';
import { mapSafeAuthError } from '../services/securityService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { useNutritionStore } from './useNutritionStore';

interface AuthState {
  currentUser: AuthenticatedUser | null;
  isRecovering: boolean;
  initializationError: string | null;
  isInitialized: boolean;
  isSubmitting: boolean;
  isCloudActive: boolean;

  initializeAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthOperationResult>;
  register: (fullName: string, email: string, password: string) => Promise<AuthOperationResult>;
  logout: (wipeDeviceData?: boolean) => Promise<void>;
}

let authGeneration = 0;

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isRecovering: false,
  initializationError: null,
  isInitialized: false,
  isSubmitting: false,
  isCloudActive: isSupabaseConfigured(),

  initializeAuth: async () => {
    const generation = ++authGeneration;
    set({ initializationError: null });
    try {
      const user = await authService.getCurrentUser();
      if (generation !== authGeneration) return;
      if (user) {
        await useNutritionStore.getState().initializeForUser(user, { isNewRegistration: false });
      } else {
        useNutritionStore.getState().clearActiveSessionState();
      }
      if (generation !== authGeneration) return;
      set({
        currentUser: user,
        isRecovering:
          !!user &&
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('recovery') === '1',
        isInitialized: true,
        isCloudActive: isSupabaseConfigured(),
      });
    } catch {
      if (generation !== authGeneration) return;
      useNutritionStore.getState().clearActiveSessionState();
      set({
        currentUser: null,
        initializationError:
          'No se pudo abrir la sesión o validar los datos locales. Se conservaron sin sobrescribir. No borres el almacenamiento; exporta una copia antes de reparar.',
        isInitialized: true,
        isCloudActive: isSupabaseConfigured(),
      });
    }
  },

  login: async (email, password) => {
    const generation = ++authGeneration;
    set({ isSubmitting: true });
    try {
      const result = await authService.loginWithEmail({ email, password });
      if (generation !== authGeneration)
        return { success: false, errorMessage: 'La sesión cambió. Vuelve a intentarlo.' };
      if (result.success && result.user) {
        await useNutritionStore
          .getState()
          .initializeForUser(result.user, { isNewRegistration: false });
        if (generation === authGeneration) set({ currentUser: result.user });
      }
      return result;
    } catch (error) {
      return { success: false, errorMessage: mapSafeAuthError(error) };
    } finally {
      if (generation === authGeneration) set({ isSubmitting: false });
    }
  },

  register: async (fullName, email, password) => {
    const generation = ++authGeneration;
    set({ isSubmitting: true });
    try {
      const result = await authService.registerWithEmail({
        fullName,
        email,
        password,
      });
      if (generation !== authGeneration)
        return { success: false, errorMessage: 'La sesión cambió. Vuelve a intentarlo.' };
      if (result.success && result.user) {
        await useNutritionStore
          .getState()
          .initializeForUser(result.user, { isNewRegistration: true });
        if (generation === authGeneration) set({ currentUser: result.user });
      }
      return result;
    } catch (error) {
      return { success: false, errorMessage: mapSafeAuthError(error) };
    } finally {
      if (generation === authGeneration) set({ isSubmitting: false });
    }
  },

  logout: async (wipeDeviceData = false) => {
    authGeneration += 1;
    await cloudSyncService.drain();
    cloudSyncService.disconnect();
    await authService.logout(wipeDeviceData);
    useNutritionStore.getState().clearActiveSessionState();
    set({ currentUser: null });
  },
}));

export function invalidateAuthSession(): void {
  authGeneration += 1;
  cloudSyncService.disconnect();
  useNutritionStore.getState().clearActiveSessionState();
  useAuthStore.setState({
    currentUser: null,
    isInitialized: true,
    isSubmitting: false,
    isRecovering: false,
  });
}
