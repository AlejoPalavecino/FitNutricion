from pathlib import Path
import json,re

def write(name,text):
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
p=Path('src/components/gym/OpenGymHub.tsx');s=p.read_text().replace('useEffect, useMemo, useState','useCallback, useEffect, useMemo, useState').replace('  const setSelectedRoutineId = (nextRoutineId: string) => {','  const setSelectedRoutineId = useCallback((nextRoutineId: string) => {').replace('  };\n\n  useEffect(() => {\n    if (\n      workoutRoutines.length','  }, [setActiveWorkoutDraft]);\n\n  useEffect(() => {\n    if (\n      workoutRoutines.length',1)
s=s.replace('[workoutRoutines, selectedRoutineId, activeWorkoutDraft]','[workoutRoutines, selectedRoutineId, activeWorkoutDraft, setActiveWorkoutDraft, setSelectedRoutineId]')
s=s.replace('    activeRoutine?.id,\n    activeRoutine?.exercises,','    activeRoutine,\n    activeWorkoutDraft,\n    setActiveWorkoutDraft,');p.write_text(s)
p=Path('src/components/gym/RestTimer.tsx');s=p.read_text().replace('[restTimerEndsAtMs]','[restTimerEndsAtMs, setActiveWorkoutDraft]');p.write_text(s)
p=Path('src/components/onboarding/BiometricCheckinView.tsx');s=p.read_text().replace('  const timelineLogs = useNutritionStore(s=>s.timelineLogs);','  useNutritionStore(s=>s.timelineLogs);').replace('  const completeDates = useNutritionStore(s=>s.completedNutritionDates);','  useNutritionStore(s=>s.completedNutritionDates);');s=s.replace('  const adaptiveStatus = useMemo(\n    () => computeCurrentAdaptiveTdeeStatus(),\n    [computeCurrentAdaptiveTdeeStatus, biometricLogs, userProfile, timelineLogs, completeDates]\n  );','  const adaptiveStatus = computeCurrentAdaptiveTdeeStatus();');p.write_text(s)
# A single account-scoped export never includes passwords, sessions or service keys.
write('src/services/exportData.ts',r'''import {offlineFirstStorage} from '../lib/storage';
export async function exportUserData(userId:string):Promise<void>{
 if(!userId)throw new Error('No hay una cuenta activa.');
 const raw=await offlineFirstStorage.getItem(`fitnutricion-user-data-v2:${userId}`);
 if(!raw)throw new Error('No hay datos guardados para exportar.');
 const blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download='fitnutricion-datos-personales.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
''')
p=Path('src/components/navigation/AccountActions.tsx');s="import {exportUserData} from '../../services/exportData';\n"+p.read_text();s=s.replace(' return <div className='," return <div className=");s=s.replace('<button type="button" disabled={busy} onClick={()=>void leave(false)}>','<button type="button" disabled={busy} onClick={async()=>{try{const user=useAuthStore.getState().currentUser;if(user)await exportUserData(user.id);}catch{setError(\'No se pudo exportar la copia local.\');}}}>Exportar mis datos (sin cifrar)</button><button type="button" disabled={busy} onClick={()=>void leave(false)}>');p.write_text(s)
write('README.md','''# FitNutrición

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
''')
write('docs/OPERATIONS.md','''# Operación y aceptación

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
''')
write('SECURITY.md','''# Seguridad

No compartas datos biométricos, contraseñas, tokens, claves ni exportaciones personales en issues públicos. Para una vulnerabilidad, usa el mecanismo privado de reporte de GitHub si está habilitado o un canal privado acordado con el propietario antes de publicar detalles.

## Modelo de protección

El modo local verifica contraseñas con PBKDF2 y salts aleatorios, pero **no cifra** los datos de salud ni protege contra alguien con acceso al perfil del navegador. En equipos compartidos, usar salida con borrado y verificar el resultado. La salida normal conserva los datos para funcionamiento offline.

En nube, RLS aísla lecturas por propietario y el RPC de sincronización deriva el usuario de `auth.uid()`, no de un parámetro del cliente. Claves públicas son públicas por diseño; claves privilegiadas no deben entrar al frontend. El RPC SECURITY DEFINER tiene search_path vacío y permisos explícitos. Revisar grants y políticas en la instancia real.

La UI valida entradas remotas antes de utilizarlas, no ejecuta código descargado para catálogos y no cachea respuestas de APIs en el service worker. Ninguna de estas medidas constituye una garantía absoluta ni una auditoría legal o clínica.
''')
write('THIRD_PARTY_NOTICES.md','''# Procedencia y licencias pendientes de aceptación

## OpenGym

El catálogo y script originales indican `emilfunk/opengym` como fuente. En la revisión `678bf5bf10446e8997a77d43e89c9b2721d8d0fc`, su archivo LICENSE declara GNU Affero General Public License, versión 3. El script fija esa revisión para futuras ingestas. No se ha reconstruido una cadena de procedencia completa para cada fila del catálogo ya incorporado anteriormente; no debe atribuirse ese snapshot anterior automáticamente a la revisión fijada ahora.

Fuente y licencia: https://github.com/emilfunk/opengym/tree/678bf5bf10446e8997a77d43e89c9b2721d8d0fc

## Medios de ejercicios

Las URLs existentes apuntan a `hasaneyldrm/exercises-dataset`. Las futuras descargas se fijan a `7455efae41b330c265e7cd4b78dfa848e7ce5ebd`. Falta verificar derechos y condiciones aplicables a cada recurso; no se presume permiso comercial ni se redistribuyen medios automáticamente durante instalación/build.

## Open Food Facts

Los resultados se identifican como provenientes de Open Food Facts y deben contrastarse con el envase. Revisar las condiciones de atribución y reutilización de su base antes de distribuir un catálogo derivado. La aplicación realiza consultas explícitas, no copia masivamente el servicio.

## Código propio

Esta mejora no asigna una licencia al código del propietario. La elección de licencia y su compatibilidad con componentes/datos de terceros requiere decisión expresa del propietario. Este documento registra procedencia y pendientes, no emite una conclusión legal de compatibilidad.
''')
write('CONTRIBUTING.md','''# Contribuir

Trabaja en una rama y abre un PR asociado a un issue. Incluye pruebas de regresión, resultado de lint/build/tests y cambios de datos/migración. No agregues credenciales ni datos reales de personas. Usa Node indicado en `.nvmrc` y `npm ci`.

Ejecuta `npm run format` antes de publicar. No suprimas reglas de seguridad para conseguir un check verde; documenta excepciones justificadas. Todo cambio del protocolo de sincronización debe preservar idempotencia, aislamiento, tombstones e historial. Las fórmulas deben tener ejemplos y límites explícitos; cambios clínicos necesitan revisión profesional independiente.
''')
write('.github/PULL_REQUEST_TEMPLATE.md','''## Issue y alcance

Refs #

## Cambios y compatibilidad

Describe contratos, migraciones y datos históricos afectados.

## Validación

- [ ] Lint, formato, tipos y pruebas.
- [ ] Build y navegador cuando cambia UI/offline.
- [ ] Pruebas SQL si cambia seguridad o persistencia.
- [ ] Sin secretos ni datos personales.

## Despliegue / reversión / límites

Indica verificaciones reales pendientes; no confundir simulación con validación productiva.
''')
write('.github/dependabot.yml','''version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
''')
p=Path('.github/workflows/ci.yml');s=p.read_text();s=s.replace('      - run: npm test','      - run: npm run lint\n      - run: npm run format:check\n      - run: npm audit --audit-level=high\n      - run: npm test');s=s.replace('      - run: npm run build','      - run: npm run build\n        env:\n          VITE_AUTH_MODE: local');s=s.replace('      - run: git diff --check','      - run: git diff --check\n      - run: npx playwright install --with-deps chromium\n      - run: npm run test:e2e\n      - uses: actions/upload-artifact@v4\n        if: failure()\n        with:\n          name: browser-test-results\n          path: test-results\n          retention-days: 3');p.write_text(s)
# Remove one-time transport/bootstrap workflows from the final tree.
for name in ['.github/workflows/review-bootstrap.yml','.github/workflows/apply-remediation.yml']:
 Path(name).unlink(missing_ok=True)
