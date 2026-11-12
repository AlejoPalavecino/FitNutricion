# Protocolo de sincronización v2

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
