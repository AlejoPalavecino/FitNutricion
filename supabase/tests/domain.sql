DO $$BEGIN
 IF public.estimated_1rm_v1(100,8,'working')<>124.2 THEN RAISE EXCEPTION 'Brzycki parity';END IF;
 IF public.estimated_1rm_v1(100,12,'working')<>140.0 THEN RAISE EXCEPTION 'Epley parity';END IF;
 IF public.estimated_1rm_v1(100,1,'working')<>100.0 OR public.estimated_1rm_v1(100,8,'warmup')<>0 THEN RAISE EXCEPTION '1RM edge case';END IF;
 IF has_function_privilege('authenticated','public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text)','EXECUTE') THEN RAISE EXCEPTION 'Obsolete calculation RPC exposed';END IF;
END$$;
