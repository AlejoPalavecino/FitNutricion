-- Regression checks for the deployed privilege-hardening migration.
BEGIN;

DO $$
DECLARE
  event_trigger_enabled boolean;
  function_settings text[];
BEGIN
  ASSERT NOT has_function_privilege('anon','public.rls_auto_enable()','EXECUTE'),
    'anon must not execute the SECURITY DEFINER event-trigger function';
  ASSERT NOT has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE'),
    'authenticated must not execute the SECURITY DEFINER event-trigger function';

  SELECT (e.evtenabled <> 'D') INTO event_trigger_enabled
  FROM pg_event_trigger e
  WHERE e.evtfoid = 'public.rls_auto_enable()'::regprocedure;
  ASSERT coalesce(event_trigger_enabled,false),
    'ensure_rls event trigger must remain enabled';

  ASSERT NOT has_function_privilege('anon',
    'public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text)','EXECUTE'),
    'anon must not execute the legacy target calculator';
  ASSERT NOT has_function_privilege('authenticated',
    'public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text)','EXECUTE'),
    'authenticated must not execute the legacy target calculator';

  SELECT p.proconfig INTO function_settings
  FROM pg_proc p
  WHERE p.oid = 'public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text)'::regprocedure;
  ASSERT function_settings @> ARRAY['search_path=""'],
    'legacy calculator must have an empty search_path';

  ASSERT NOT has_table_privilege('anon','public.sync_operation_receipts','SELECT'),
    'anon must not read sync receipts directly';
  ASSERT NOT has_table_privilege('authenticated','public.sync_operation_receipts','SELECT'),
    'authenticated must not read sync receipts directly';
  ASSERT NOT has_table_privilege('authenticated','public.sync_operation_receipts','INSERT'),
    'authenticated must not insert sync receipts directly';
  ASSERT NOT has_table_privilege('authenticated','public.sync_operation_receipts','UPDATE'),
    'authenticated must not update sync receipts directly';
  ASSERT NOT has_table_privilege('authenticated','public.sync_operation_receipts','DELETE'),
    'authenticated must not delete sync receipts directly';

  ASSERT NOT has_function_privilege('anon',
    'public.apply_sync_operation(uuid,text,text,bigint,jsonb)','EXECUTE'),
    'anon must not execute the sync RPC';
  ASSERT has_function_privilege('authenticated',
    'public.apply_sync_operation(uuid,text,text,bigint,jsonb)','EXECUTE'),
    'authenticated must execute the sync RPC';
END $$;

ROLLBACK;
