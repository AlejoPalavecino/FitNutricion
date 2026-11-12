# Privacidad y límites del modo local

El modo local almacena información de salud **sin cifrar** en el navegador. PBKDF2-SHA256
(salt aleatorio de 128 bits; 600.000 iteraciones) verifica la contraseña, pero no cifra
los registros. El propietario del dispositivo o un script que comprometa el origen
puede acceder a esos datos. No es una bóveda criptográfica ni una frontera de seguridad
frente a un usuario con acceso al navegador. Usar un dispositivo propio protegido.

Las credenciales SHA-256 antiguas se actualizan después de verificar la contraseña.
El antiguo fallback no criptográfico deja de admitirse: no se crea una vía de omisión
para recuperar esas cuentas. Conservar una copia del dispositivo y solicitar una
migración asistida antes de borrar información.

Cerrar sesión conserva la copia local salvo que se solicite borrarla. La eliminación
se limita a los datos del usuario activo en ambos almacenes, no a todas las cuentas.
Si falla algún almacén, se informa el error y no se declara un borrado completo.

## Supabase

Aplicar `supabase/migrations/202611120001_privacy.sql` en PostgreSQL 15+ después
del esquema existente. Revisar grants y la exposición de vistas de la instancia real.
Las pruebas usan un contrato auth mínimo sobre PostgreSQL, no credenciales reales.
No se ejecutó una migración de producción desde este PR.

Referencias de diseño:

- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://supabase.com/docs/guides/database/postgres/row-level-security
