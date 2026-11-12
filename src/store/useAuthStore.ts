import { cloudSyncService } from '../services/cloudSyncService';
import { mapSafeAuthError } from '../services/securityService';
import { create } from 'zustand';
import {
  authService,
  type AuthenticatedUser,
  type AuthOperationResult,
} from '../services/authService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { useNutritionStore } from './useNutritionStore';

interface AuthState {
  currentUser: AuthenticatedUser | null;
  isInitialized: boolean;
  isSubmitting: boolean;
  isCloudActive: boolean;

  initializeAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthOperationResult>;
  register: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<AuthOperationResult>;
  logout: (wipeDeviceData?: boolean) => Promise<void>;
}

let authGeneration = 0;

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isInitialized: false,
  isSubmitting: false,
  isCloudActive: isSupabaseConfigured(),

  initializeAuth: async () => {
    const generation = ++authGeneration;
    try {
      const user = await authService.getCurrentUser();
      if (generation !== authGeneration) return;
      if (user) {
        await useNutritionStore
          .getState()
          .initializeForUser(user, { isNewRegistration: false });
      } else {
        useNutritionStore.getState().clearActiveSessionState();
      }
      if (generation !== authGeneration) return;
      set({
        currentUser: user,
        isInitialized: true,
        isCloudActive: isSupabaseConfigured(),
      });
    } catch {
      if (generation !== authGeneration) return;
      useNutritionStore.getState().clearActiveSessionState();
      set({
        currentUser: null,
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
      if (generation !== authGeneration) return { success: false, errorMessage: 'La sesión cambió. Vuelve a intentarlo.' };
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
      if (generation !== authGeneration) return { success: false, errorMessage: 'La sesión cambió. Vuelve a intentarlo.' };
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
