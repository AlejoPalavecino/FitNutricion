-- Harden legacy Supabase function privileges without changing user data.
-- Safe to apply repeatedly; event-trigger execution does not require client EXECUTE.
BEGIN;

DO $migration$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END;
$migration$;

-- This legacy calculator is not used by the current client. Keep its execution
-- restricted and pin name resolution in case an administrator invokes it.
DO $migration$
BEGIN
  IF to_regprocedure('public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text)') IS NOT NULL THEN
    ALTER FUNCTION public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text)
      SET search_path = '';
    REVOKE ALL ON FUNCTION public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text)
      FROM PUBLIC, anon, authenticated;
  END IF;
END;
$migration$;

-- Receipts are intentionally accessible only inside apply_sync_operation,
-- which derives the owner from auth.uid(). No direct Data API access.
REVOKE ALL ON TABLE public.sync_operation_receipts FROM PUBLIC, anon, authenticated;

COMMIT;
