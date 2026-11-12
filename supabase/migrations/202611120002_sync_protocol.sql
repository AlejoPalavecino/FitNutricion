-- Versioned aggregate snapshots. Legacy normalized tables remain import-only.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sync_documents (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('profile','biometric','food','recipe','exercise','timeline','checkin','routine','session','preferences')),
 entity_key text NOT NULL CHECK(length(entity_key) BETWEEN 1 AND 200),
 payload jsonb CHECK(payload IS NULL OR jsonb_typeof(payload)='object'),
 version bigint NOT NULL CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,kind,entity_key)
);
CREATE TABLE IF NOT EXISTS public.sync_operation_receipts (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,operation_id uuid NOT NULL,
 request jsonb NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,operation_id)
);
ALTER TABLE public.sync_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_operation_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own sync documents" ON public.sync_documents;
CREATE POLICY "Read own sync documents" ON public.sync_documents FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.sync_documents,public.sync_operation_receipts FROM anon,authenticated;
GRANT SELECT ON public.sync_documents TO authenticated;
CREATE OR REPLACE FUNCTION public.apply_sync_operation(p_operation_id uuid,p_kind text,p_entity_key text,p_expected_version bigint,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 owner_id uuid:=auth.uid(); current_doc public.sync_documents%ROWTYPE;
 receipt public.sync_operation_receipts%ROWTYPE; request_body jsonb;result_body jsonb;current_version bigint;
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 IF p_operation_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('profile','biometric','food','recipe','exercise','timeline','checkin','routine','session','preferences')
 OR p_entity_key IS NULL OR length(p_entity_key) NOT BETWEEN 1 AND 200 OR p_expected_version IS NULL OR p_expected_version<0
 OR(p_payload IS NOT NULL AND(jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>524288))
 THEN RAISE EXCEPTION 'Invalid sync operation' USING ERRCODE='22023';END IF;
 IF p_payload IS NOT NULL THEN
  IF p_kind='profile' AND(p_entity_key<>owner_id::text OR p_payload->>'id' IS DISTINCT FROM owner_id::text)
  THEN RAISE EXCEPTION 'Invalid profile owner' USING ERRCODE='42501';END IF;
  IF p_kind IN ('routine','session') AND jsonb_typeof(p_payload->(CASE WHEN p_kind='routine' THEN 'exercises' ELSE 'sets' END)) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid aggregate' USING ERRCODE='22023';END IF;
  IF p_kind='biometric' AND(p_payload->>'date' IS DISTINCT FROM p_entity_key OR coalesce((p_payload->>'scaleWeightKg')::numeric,0)<=0)
  THEN RAISE EXCEPTION 'Invalid biometric entry' USING ERRCODE='22023';END IF;
  IF p_kind NOT IN ('biometric','preferences') AND p_payload->>'id' IS DISTINCT FROM p_entity_key
  THEN RAISE EXCEPTION 'Entity ID mismatch' USING ERRCODE='22023';END IF;
 END IF;
 request_body:=jsonb_build_array(p_kind,p_entity_key,p_expected_version,p_payload);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':'||p_kind||':'||p_entity_key,0));
 SELECT * INTO receipt FROM public.sync_operation_receipts WHERE user_id=owner_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF receipt.request<>request_body THEN RAISE EXCEPTION 'Operation ID reused with different contents' USING ERRCODE='22023';END IF;
  RETURN receipt.response;
 END IF;
 SELECT * INTO current_doc FROM public.sync_documents WHERE user_id=owner_id AND kind=p_kind AND entity_key=p_entity_key FOR UPDATE;
 current_version:=coalesce(current_doc.version,0);
 IF current_version<>p_expected_version THEN
  RETURN jsonb_build_object('status','conflict','document',jsonb_build_object('kind',p_kind,'entity_key',p_entity_key,'payload',current_doc.payload,'version',current_version));
 END IF;
 INSERT INTO public.sync_documents(user_id,kind,entity_key,payload,version)VALUES(owner_id,p_kind,p_entity_key,p_payload,current_version+1)
 ON CONFLICT(user_id,kind,entity_key)DO UPDATE SET payload=EXCLUDED.payload,version=EXCLUDED.version,updated_at=clock_timestamp()
 RETURNING * INTO current_doc;
 result_body:=jsonb_build_object('status','applied','document',jsonb_build_object('kind',p_kind,'entity_key',p_entity_key,'payload',current_doc.payload,'version',current_doc.version));
 INSERT INTO public.sync_operation_receipts(user_id,operation_id,request,response)VALUES(owner_id,p_operation_id,request_body,result_body);
 RETURN result_body;
END;$$;
REVOKE ALL ON FUNCTION public.apply_sync_operation(uuid,text,text,bigint,jsonb)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_sync_operation(uuid,text,text,bigint,jsonb)TO authenticated;
COMMIT;
