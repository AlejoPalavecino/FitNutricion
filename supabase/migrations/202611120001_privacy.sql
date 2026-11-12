-- PostgreSQL 15+. Apply after the existing schema; no health rows are modified.
BEGIN;
ALTER VIEW public.v_biometric_logs_computed SET (security_invoker = true);
ALTER VIEW public.v_recipe_totals SET (security_invoker = true);
ALTER VIEW public.v_workout_set_logs_computed SET (security_invoker = true);
ALTER VIEW public.v_workout_sessions_summary SET (security_invoker = true);
REVOKE ALL ON public.v_biometric_logs_computed, public.v_workout_set_logs_computed,
  public.v_workout_sessions_summary FROM anon;
GRANT SELECT ON public.v_biometric_logs_computed, public.v_recipe_totals,
  public.v_workout_set_logs_computed, public.v_workout_sessions_summary TO authenticated;
COMMIT;
