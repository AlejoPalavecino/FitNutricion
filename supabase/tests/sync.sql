BEGIN;
INSERT INTO auth.users(id)VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $$DECLARE result jsonb;BEGIN
 result:=public.apply_sync_operation('00000000-0000-4000-8000-000000000001','food','off-123',0,'{"id":"off-123","name":"A"}');
 IF result->>'status'<>'applied' OR(result#>>'{document,version}')::int<>1 THEN RAISE EXCEPTION 'insert failed';END IF;
 result:=public.apply_sync_operation('00000000-0000-4000-8000-000000000001','food','off-123',0,'{"id":"off-123","name":"A"}');
 IF(result#>>'{document,version}')::int<>1 THEN RAISE EXCEPTION 'retry not idempotent';END IF;
 result:=public.apply_sync_operation('00000000-0000-4000-8000-000000000002','food','off-123',0,'{"id":"off-123","name":"stale"}');
 IF result->>'status'<>'conflict' THEN RAISE EXCEPTION 'stale update accepted';END IF;
 BEGIN
  PERFORM public.apply_sync_operation('00000000-0000-4000-8000-000000000001','food','off-123',0,'{"id":"off-123","name":"tampered retry"}');
  RAISE EXCEPTION 'changed replay accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 result:=public.apply_sync_operation('00000000-0000-4000-8000-000000000003','food','off-123',1,NULL);
 IF result#>'{document,payload}'<>'null'::jsonb THEN RAISE EXCEPTION 'tombstone absent';END IF;
 result:=public.apply_sync_operation('00000000-0000-4000-8000-000000000004','food','off-123',1,'{"id":"off-123","name":"resurrect"}');
 IF result->>'status'<>'conflict' THEN RAISE EXCEPTION 'stale resurrection accepted';END IF;
 PERFORM public.apply_sync_operation('00000000-0000-4000-8000-000000000005','routine','routine-1',0,'{"id":"routine-1","name":"original","exercises":[]}');
 BEGIN
  PERFORM public.apply_sync_operation('00000000-0000-4000-8000-000000000006','routine','routine-1',1,'{"id":"routine-1","name":"bad","exercises":null}');
  RAISE EXCEPTION 'invalid aggregate accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 IF(SELECT payload->>'name' FROM public.sync_documents WHERE kind='routine' AND entity_key='routine-1')<>'original' THEN RAISE EXCEPTION 'aggregate partially changed';END IF;
 BEGIN
  UPDATE public.sync_documents SET version=99 WHERE entity_key='routine-1';RAISE EXCEPTION 'direct write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.sync_documents)THEN RAISE EXCEPTION 'cross-account disclosure';END IF;
 PERFORM public.apply_sync_operation('00000000-0000-4000-8000-000000000001','food','off-123',0,'{"id":"off-123","name":"B"}');
 IF(SELECT payload->>'name' FROM public.sync_documents WHERE entity_key='off-123')<>'B' THEN RAISE EXCEPTION 'product ID collision';END IF;
 BEGIN
  PERFORM public.apply_sync_operation('00000000-0000-4000-8000-000000000007','profile','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
  RAISE EXCEPTION 'forged profile accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
RESET ROLE;SET LOCAL ROLE anon;SELECT set_config('request.jwt.claim.sub','',true);
DO $$BEGIN
 BEGIN
  PERFORM public.apply_sync_operation('00000000-0000-4000-8000-000000000008','food','off-123',0,'{}');RAISE EXCEPTION 'anonymous write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
ROLLBACK;
