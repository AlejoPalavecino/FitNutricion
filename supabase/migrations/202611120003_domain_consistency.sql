BEGIN;
CREATE OR REPLACE FUNCTION public.estimated_1rm_v1(weight_kg numeric,reps integer,set_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
 SELECT CASE WHEN set_type='warmup' OR reps<=0 OR weight_kg<=0 THEN 0::numeric
 WHEN reps=1 THEN ROUND(weight_kg,1)
 WHEN reps<=10 THEN ROUND(weight_kg/(1.0278-0.0278*reps),1)
 ELSE ROUND(weight_kg*(1+reps/30.0),1) END;
$$;
CREATE OR REPLACE VIEW public.v_workout_set_logs_computed WITH(security_invoker=true) AS
 SELECT s.*,public.estimated_1rm_v1(s.weight_kg,s.reps,s.set_type) AS estimated_1rm FROM public.workout_set_logs s;
-- The application no longer uses this divergent legacy calculator.
REVOKE EXECUTE ON FUNCTION public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text) FROM PUBLIC,anon,authenticated;
COMMIT;
