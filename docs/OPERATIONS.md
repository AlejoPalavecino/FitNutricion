# Operación y aceptación

## Antes de producción

1. Revisar y fusionar en orden las cuatro etapas apiladas. Preparar backup verificable y probar su restauración en una base separada.
2. Aplicar migraciones en staging, cargar semillas y comprobar que dos cuentas no acceden a datos ajenos en tablas, vistas ni RPC. El pipeline usa un PostgreSQL efímero, no verifica tu instancia desplegada.
3. Validar alta, confirmación y recuperación de contraseña con el proveedor de correo y las URLs permitidas en Supabase. No registrar tokens, correos, alimentos o medidas en logs. El frontend publica únicamente códigos/mensajes seguros.
4. Probar dos navegadores con cortes reales de red: alta, edición, borrado, conflictos, cierre abrupto y reapertura. Comprobar que las versiones antiguas de clientes ya no escriban durante la migración.
5. Verificar apertura offline, actualización pospuesta mientras se entrena, varias pestañas, restauración del borrador, accesibilidad con teclado/lector y comportamiento móvil. Los tests automáticos no equivalen a certificación WCAG.
6. Revisar procedencia/licencias del catálogo y validación profesional del motor antes de promocionar resultados como recomendaciones de salud.

## Fallos y recuperación

Un error local indica que no se pudo confirmar almacenamiento durable. No cerrar ni borrar el navegador hasta exportar una copia y resolver la cuota. Los snapshots inválidos se conservan sin sobrescribir; inspeccionarlos sin publicar datos personales. `Exportar mis datos` descarga exclusivamente el snapshot de salud de la cuenta activa, sin credenciales; el archivo no está cifrado.

El estado de sincronización distingue local, pendiente, confirmado y conflicto. Reintentar no genera identificadores nuevos de operaciones ya pendientes. Elegir versión remota descarta explícitamente el cambio local; conservar local crea una nueva operación contra la revisión remota conocida.

Los tombstones, recibos y checkpoints de batches no se purgan por tiempo: hacerlo podría resucitar datos o repetir operaciones desde dispositivos antiguos. Antes de compactarlos, diseñar un watermark de dispositivos y período de soporte. Esta retención consume espacio y debe medirse con historiales grandes.

Las preferencias siguen siendo un agregado por cuenta: ediciones concurrentes de distintos favoritos pueden requerir resolver un conflicto. Los snapshots locales siguen siendo completos; la separación del temporizador evita escrituras por tick, pero se debe perfilar la persistencia con historiales extensos antes de prometer rendimiento ilimitado.

## Despliegue

Vercel incluye CSP, cabeceras defensivas y excepciones de rewrite para el service worker. La CSP admite los dominios Supabase estándar; ajustar conscientemente para dominios personalizados. No insertar `unsafe-eval` para resolver errores de integración.

Los PRs contienen migraciones revisables, no comandos que se ejecuten contra producción. Ante rollback del cliente, no volver a un cliente relacional antiguo después de comenzar escrituras v2 sin una migración inversa diseñada y ensayada. La estrategia de rollback es restaurar en staging y corregir hacia adelante hasta validar recuperación, no mezclar protocolos.

## Mantenimiento

CI bloquea errores de lint, formato, tipos, tests, build y vulnerabilidades altas/críticas. Dependabot propone actualizaciones; revisarlas con sus pruebas antes de integrar. La disponibilidad de la red y de recursos externos es independiente de la persistencia de datos.
