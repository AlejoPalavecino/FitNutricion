# Seguridad

No compartas datos biométricos, contraseñas, tokens, claves ni exportaciones personales en issues públicos. Para una vulnerabilidad, usa el mecanismo privado de reporte de GitHub si está habilitado o un canal privado acordado con el propietario antes de publicar detalles.

## Modelo de protección

El modo local verifica contraseñas con PBKDF2 y salts aleatorios, pero **no cifra** los datos de salud ni protege contra alguien con acceso al perfil del navegador. En equipos compartidos, usar salida con borrado y verificar el resultado. La salida normal conserva los datos para funcionamiento offline.

En nube, RLS aísla lecturas por propietario y el RPC de sincronización deriva el usuario de `auth.uid()`, no de un parámetro del cliente. Claves públicas son públicas por diseño; claves privilegiadas no deben entrar al frontend. El RPC SECURITY DEFINER tiene search_path vacío y permisos explícitos. Revisar grants y políticas en la instancia real.

La UI valida entradas remotas antes de utilizarlas, no ejecuta código descargado para catálogos y no cachea respuestas de APIs en el service worker. Ninguna de estas medidas constituye una garantía absoluta ni una auditoría legal o clínica.
