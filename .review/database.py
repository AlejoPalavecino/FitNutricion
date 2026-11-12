from pathlib import Path
files={}
files['supabase/migrations/202611120002_sync_protocol.sql']=r'''-- Versioned aggregate snapshots. Legacy normalized tables remain import-only.
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
'''
files['supabase/tests/sync.sql']=r'''BEGIN;
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
'''
files['scripts/generate-seed.mjs']=r'''// Deterministic public catalog seed: no network, credentials or user records.
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const bundle=await build({stdin:{contents:"export { INITIAL_FOOD_ITEMS,INITIAL_RECIPES } from './src/data/seedData'; export { OPENGYM_EXERCISE_CATALOG } from './src/data/opengymCatalog';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {INITIAL_FOOD_ITEMS:foods,INITIAL_RECIPES:recipes,OPENGYM_EXERCISE_CATALOG:exercises}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const quote=v=>v==null?'NULL':typeof v==='number'?String(v):typeof v==='boolean'?(v?'TRUE':'FALSE'):`'${String(v).replaceAll("'","''")}'`;
const lines=['-- Generated by node scripts/generate-seed.mjs; do not edit.','BEGIN;'];
function insert(table,columns,values){lines.push(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.map(quote).join(',')}) ON CONFLICT DO NOTHING;`);}
for(const f of foods)insert('food_items',['id','name','brand','kcal_per_100g','protein_per_100g','carbs_per_100g','fat_per_100g','fiber_per_100g','default_serving_name','default_serving_grams','is_bridge_food'],[f.id,f.name,f.brand,f.kcalPer100g,f.proteinPer100g,f.carbsPer100g,f.fatPer100g,f.fiberPer100g??0,f.defaultServingName,f.defaultServingGrams,!!f.isBridgeFood]);
for(const r of recipes){insert('recipes',['id','name'],[r.id,r.name]);for(const i of r.ingredients)insert('recipe_ingredients',['recipe_id','food_id','grams'],[r.id,i.foodId,i.grams]);}
for(const ex of exercises){
 insert('equipment_types',['id','name_es'],[ex.equipment,ex.equipment]);
 for(const m of [ex.primaryMuscle,...ex.secondaryMuscles])insert('muscle_groups',['id','name_es'],[m,m]);
 insert('exercise_catalog_items',['id','name_es','name_en','equipment_id','category_id','is_unilateral'],[ex.id,ex.nameEs,ex.nameEn,ex.equipment,ex.category,!!ex.isUnilateral]);
 insert('exercise_muscle_groups',['exercise_id','muscle_group_id','involvement_role'],[ex.id,ex.primaryMuscle,'primary']);
 for(const m of ex.secondaryMuscles)insert('exercise_muscle_groups',['exercise_id','muscle_group_id','involvement_role'],[ex.id,m,'secondary']);
 ex.instructionsEs.forEach((text,i)=>insert('exercise_instructions',['exercise_id','step_number','instruction_es'],[ex.id,i+1,text]));
 ex.images.forEach((url,i)=>insert('exercise_images',['exercise_id','image_order','image_url'],[ex.id,i,url]));
 ex.aliases.forEach(text=>insert('exercise_aliases',['exercise_id','alias_text'],[ex.id,text]));
}
lines.push('COMMIT;','');await writeFile('supabase/seed.sql',lines.join('\n'));
'''
files['docs/SYNC.md']='''# Protocolo de sincronización v2

## Decisión y compatibilidad
Los nuevos registros se guardan como snapshots versionados por agregado en `sync_documents`. Una rutina con sus ejercicios o una sesión con sus series se confirma atómicamente. La clave incluye propietario, tipo e ID; dos usuarios pueden importar el mismo código de producto sin colisionar. Los macros y nombres históricos se preservan tal como se registraron.

Las tablas normalizadas anteriores se mantienen para importación y referencia, **no se escriben en paralelo**. Sus vistas no representan registros v2. Este cambio de contrato debe revisarse antes de integrar consumidores SQL. La desnormalización de agregados históricos es intencional; no se afirma que el nuevo protocolo sea 3FN. No mezclar clientes antiguos y nuevos escribiendo simultáneamente.

## Migración y despliegue
Respaldar la base. Probar en staging con PostgreSQL 15+. Base nueva: esquema, migraciones en orden, semilla. Base existente: solamente migraciones pendientes y semilla idempotente. `node scripts/generate-seed.mjs` no usa red. Nunca ejecutar `supabase/tests/bootstrap.sql` en producción.

La importación combina historial remoto anterior y snapshot local. Variantes diferentes quedan como conflictos explícitos. Un tombstone ya confirmado no se resucita desde una caché antigua. Los borradores activos son locales al dispositivo y no se sincronizan entre teléfonos. No se aplicaron migraciones a la instancia productiva durante esta implementación.

## Cola y conflictos
IndexedDB es la copia autoritativa de la outbox. Web Locks serializa las pestañas de una cuenta. Modo nube requiere ambas APIs y HTTPS; si faltan, se muestra un error, no un éxito ficticio. El UUID de una operación no cambia en un reintento. El servidor conserva recibos y compara versiones. Los conflictos preservan el cambio local hasta elegir explícitamente una versión.

Los reintentos tienen espera creciente hasta cinco minutos y se revisan cada 30 segundos, al recuperar red y al cambiar visibilidad, mientras la app está abierta. No se promete sincronización con la app cerrada. No hay purga automática de tombstones o recibos: una política de retención debe contemplar dispositivos desconectados.

## Seguridad
El RPC usa SECURITY DEFINER, search_path vacío y SQL estático porque las tablas no permiten escrituras directas del cliente. El propietario se deriva exclusivamente de auth.uid(); no es un parámetro. Solo se concede EXECUTE al rol autenticado. Las lecturas están aisladas por RLS. Las pruebas SQL verifican usuarios A/B, anónimo, repetición idempotente, conflicto, agregado inválido y prohibición de escritura directa.

Los datos del navegador no están cifrados. El borrado del dispositivo incluye su outbox; borrar con cambios pendientes puede perder información no confirmada. El logout drena las tareas ya encoladas antes de limpiar.

## Verificación del entorno pendiente
Probar cortes reales de red en dos navegadores, recuperación de backup y despliegue coordinado. Las pruebas de motor y PostgreSQL efímero no verifican los permisos de una instancia productiva. Las restricciones técnicas no constituyen validación clínica.
'''
for name,content in files.items():
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
