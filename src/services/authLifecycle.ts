import { invalidateAuthSession, useAuthStore } from '../store/useAuthStore';
import { supabase } from './supabaseClient';
/** Never await Supabase methods inside its auth callback. */
export function subscribeAuthLifecycle(): () => void {
  if (!supabase) return () => undefined;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (disposed) return;
      if (event === 'PASSWORD_RECOVERY')
        useAuthStore.setState({ isRecovering: true, isInitialized: true });
      if (
        event === 'SIGNED_IN' &&
        session?.user.id !== useAuthStore.getState().currentUser?.id &&
        !useAuthStore.getState().isSubmitting
      )
        void useAuthStore.getState().initializeAuth();
      if (event === 'SIGNED_OUT') {
        invalidateAuthSession();
      }
    }, 0);
    timers.add(timer);
  });
  return () => {
    disposed = true;
    timers.forEach(clearTimeout);
    data.subscription.unsubscribe();
  };
}
