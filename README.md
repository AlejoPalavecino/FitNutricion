# FitNutrición

Aplicación React/TypeScript de seguimiento orientativo de alimentación, entrenamiento y peso. No sustituye atención ni validación profesional. Los datos del navegador **no están cifrados**.

## Inicio reproducible

Requisitos: Node 22.12 o superior y npm. Usa `nvm use`, `npm ci`, copia `.env.example` a `.env.local` y ejecuta `npm run dev`.

`VITE_AUTH_MODE=local` crea cuentas exclusivas del navegador. No tienen recuperación por correo. `VITE_AUTH_MODE=cloud` requiere URL HTTPS y clave pública de Supabase. Nunca publiques claves `service_role` ni `sb_secret_`. Un modo cloud mal configurado muestra un error; no crea cuentas locales silenciosamente. Producción exige seleccionar modo explícitamente.

## Base de datos

En una base nueva, aplicar `supabase/schema.sql`, después `supabase/migrations/*.sql` en orden y finalmente `supabase/seed.sql`. En una base existente, respaldar primero y aplicar solo migraciones pendientes. Nunca ejecutar `supabase/tests/bootstrap.sql` en producción: crea roles simplificados exclusivamente para las pruebas efímeras.

`npm run seed:generate` reproduce la semilla desde los catálogos versionados, sin red. Ejecutarla dos veces no duplica filas.

**Cambio de contrato:** las escrituras nuevas usan `sync_documents`, agregados históricos versionados por cuenta. Las tablas relacionales antiguas solo se importan; sus vistas no representan el nuevo historial. No hay doble escritura ni afirmación de 3FN para esos snapshots. Ver [sincronización](docs/SYNC.md) antes de desplegar o integrar consumidores SQL.

## Qué se sincroniza

Perfil, pesajes, alimentos/recetas/ejercicios personalizados, registros de comidas, rutinas, sesiones, check-ins y preferencias. Los borradores de entrenamiento, editor y onboarding son locales al dispositivo. IndexedDB y Web Locks son requisitos del modo nube. Se conservan las operaciones pendientes, sus versiones y las eliminaciones; un conflicto requiere elegir una versión. No se promete sincronización mientras la aplicación esté cerrada.

La bandeja durable conserva cambios aun si la página se recarga antes de escribir la cola asíncrona. El espejo local de snapshots tiene revisión para no preferir una copia IndexedDB antigua. Una cuota agotada se muestra como error: no se puede garantizar escritura cuando el navegador rechaza todos los almacenamientos.

## Verificación

```sh
npm ci
npm run lint
npm run format:check
npm test
VITE_AUTH_MODE=local npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm audit
```

CI valida la aplicación y PostgreSQL 15 efímero, sin credenciales productivas. Las pruebas de navegador usan cuentas sintéticas locales. La entrega real de correos, las políticas desplegadas y la aceptación en dos dispositivos con Supabase requieren staging.

## Estructura

`src/store/slices` separa acciones de perfil, nutrición y entrenamientos. `src/services/sync` encapsula cola, transporte, recuperación y conflicto. `src/domain/validation.ts` valida entradas persistidas/remotas. Las pantallas principales se cargan bajo demanda y el temporizador mantiene su propio renderizado. El lector relacional anterior está aislado y paginado.

## PWA e integraciones

El build genera un service worker que almacena únicamente el shell y assets públicos de esa versión. Nunca cachea respuestas de autenticación, Supabase o datos nutricionales. La actualización es explícita, bloqueada durante un entrenamiento y con varias pestañas abiertas. La recarga offline requiere haber completado una primera carga online. Imágenes externas y búsquedas de alimentos siguen necesitando red salvo medios descargados expresamente.

Open Food Facts se consulta por acción explícita. No se interpretan nutrientes desconocidos como cero; productos incompletos se omiten con advertencia. La ingesta de ejercicios interpreta literales con Acorn, no ejecuta JavaScript remoto, fija revisiones y valida HTTP. `npm run ingest:opengym -- --limit=50 --download-media` descarga medios solo si lo solicitas y reemplaza las URLs locales; revisa sus licencias antes de usar esa opción.

## Operación y límites

Ver [operación](docs/OPERATIONS.md), [dominio](docs/DOMAIN.md), [seguridad](SECURITY.md) y [procedencia/licencias](THIRD_PARTY_NOTICES.md). No se aplicaron migraciones ni se fusionaron los PRs automáticamente. La auditoría de dependencias refleja una ejecución, no una garantía permanente de ausencia de vulnerabilidades.
