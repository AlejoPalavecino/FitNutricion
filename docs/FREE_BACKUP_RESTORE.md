# Backup y restauración gratuitos para FitNutrición

Este procedimiento está pensado para el plan Free de Supabase. No crea ramas ni proyectos alojados y no copia dumps a GitHub.

## Reglas de seguridad

- Ejecutar desde una máquina de confianza, con Docker y Supabase CLI instalados.
- Nunca pegar la cadena de conexión en chats, issues, PRs o archivos versionados.
- No guardar `roles.sql`, `schema.sql` ni `data.sql` dentro del repositorio.
- Los dumps contienen información personal y potencialmente datos de salud. Guardarlos en disco cifrado y con permisos privados.
- La restauración se realiza en una instancia local aislada, nunca sobre el proyecto remoto.
- La base de datos no incluye objetos binarios de Storage; exportarlos por separado si FitNutrición los utiliza.

## 1. Preparar un directorio privado

En una terminal local:

```bash
mkdir -p "$HOME/fitnutricion-backup"
chmod 700 "$HOME/fitnutricion-backup"
cd "$HOME/fitnutricion-backup"
umask 077
```

Obtener la cadena de conexión desde Supabase Dashboard → Connect → Connection string. No usar ni compartir la contraseña en comandos guardados en el historial. Cargarla en la variable de entorno de la sesión de forma segura:

```bash
read -rsp "Supabase database URL: " SUPABASE_DB_URL
echo
export SUPABASE_DB_URL
```

## 2. Exportar roles, esquema y datos

Requiere Supabase CLI y Docker. Consultar primero `supabase --version` y `supabase db dump --help`.

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" -f data.sql --use-copy --data-only
sha256sum roles.sql schema.sql data.sql > SHA256SUMS
unset SUPABASE_DB_URL
```

Comprobar que los tres archivos y el manifiesto SHA256 existan y no tengan tamaño cero. Guardar otra copia cifrada fuera de la máquina si se dispone de un medio gratuito y privado. No subirlos a GitHub.

## 3. Restaurar en una instancia local aislada

Crear un directorio Supabase local nuevo, separado del repositorio de producción:

```bash
mkdir -p "$HOME/fitnutricion-restore"
cd "$HOME/fitnutricion-restore"
supabase init
supabase start
supabase status
```

Confirmar que el Postgres local sea compatible con el origen (el proyecto administrado usa PostgreSQL 17). Si la CLI local levanta otra versión, detenerse y configurar una imagen local compatible antes de importar.

Restaurar en la base local recién creada, nunca en la URL remota:

```bash
sha256sum -c "$HOME/fitnutricion-backup/SHA256SUMS"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$HOME/fitnutricion-backup/roles.sql" \
  --file "$HOME/fitnutricion-backup/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$HOME/fitnutricion-backup/data.sql"
```

Si la importación falla por diferencias entre las versiones de Supabase Auth/Storage o extensiones, detenerse y corregir el entorno local. No intentar aplicar el dump parcial en producción.

## 4. Verificar la restauración

Comparar conteos de tablas clave sin imprimir información personal:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'auth.users' AS table_name, count(*) FROM auth.users
UNION ALL SELECT 'public.user_profiles', count(*) FROM public.user_profiles
UNION ALL SELECT 'public.sync_documents', count(*) FROM public.sync_documents
UNION ALL SELECT 'public.sync_operation_receipts', count(*) FROM public.sync_operation_receipts;
SQL
```

Comparar esos conteos con un manifiesto de conteos obtenido por el operador desde la base de origen, sin exportar filas. Revisar extensiones, vistas, funciones, triggers y RLS. Probar la aplicación local contra la restauración, usando usuarios de prueba y sin modificar el origen.

## 5. Limitaciones y evidencia

- Este backup lógico debe ejecutarlo el propietario desde una máquina con acceso a la cadena de conexión; ChatGPT no tiene acceso a esa contraseña ni debe recibirla.
- El dump SQL no incluye objetos de Storage ni configuración de proveedores OAuth/SMTP, plantillas de correo, DNS ni secretos de Edge Functions.
- Una restauración local demuestra que el dump se puede importar en ese entorno; no equivale a una restauración gestionada por Supabase ni a un SLA de recuperación.
- Guardar fecha, versiones de CLI/Postgres, SHA256 y resultado de restauración en el issue de despliegue. No adjuntar los dumps ni datos personales.
- Tras terminar, borrar la variable de entorno y conservar el backup cifrado según la política de retención elegida.
