import { create } from 'zustand';
import {
  authService,
  type AuthenticatedUser,
  type AuthOperationResult,
} from '../services/authService';
import { isSupabaseConnected } from '../services/supabaseClient';
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

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isInitialized: false,
  isSubmitting: false,
  isCloudActive: isSupabaseConnected(),

  initializeAuth: async () => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        await useNutritionStore
          .getState()
          .initializeForUser(user, { isNewRegistration: false });
      } else {
        useNutritionStore.getState().clearActiveSessionState();
      }
      set({
        currentUser: user,
        isInitialized: true,
        isCloudActive: isSupabaseConnected(),
      });
    } catch {
      useNutritionStore.getState().clearActiveSessionState();
      set({
        currentUser: null,
        isInitialized: true,
        isCloudActive: isSupabaseConnected(),
      });
    }
  },

  login: async (email, password) => {
    set({ isSubmitting: true });
    try {
      const result = await authService.loginWithEmail({ email, password });
      if (result.success && result.user) {
        await useNutritionStore
          .getState()
          .initializeForUser(result.user, { isNewRegistration: false });
        set({ currentUser: result.user });
      }
      return result;
    } finally {
      set({ isSubmitting: false });
    }
  },

  register: async (fullName, email, password) => {
    set({ isSubmitting: true });
    try {
      const result = await authService.registerWithEmail({
        fullName,
        email,
        password,
      });
      if (result.success && result.user) {
        await useNutritionStore
          .getState()
          .initializeForUser(result.user, { isNewRegistration: true });
        set({ currentUser: result.user });
      }
      return result;
    } finally {
      set({ isSubmitting: false });
    }
  },

  logout: async (wipeDeviceData = false) => {
    useNutritionStore.getState().clearActiveSessionState();
    await authService.logout(wipeDeviceData);
    set({ currentUser: null });
  },
}));
