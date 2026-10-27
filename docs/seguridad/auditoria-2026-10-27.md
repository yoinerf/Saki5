# Revisión de seguridad — 2026-10-27: entradas de usuario y sesiones

Rama: `vulnerabilidades` (creada desde `dev`). Sigue a las auditorías del
[2026-10-19](auditoria-2026-10-19.md) y del [2026-10-26](auditoria-2026-10-26.html); no repite lo que ya
se corrigió allí (rate limiting, reseñas, CORS, contraseña temporal, etc.).

Alcance: todos los formularios de `src/`, el manejo de sesión (inicio, cierre, recuperación de
contraseña, sesiones en varios dispositivos) y las tablas que el navegador escribe directamente.

## Resumen

| # | Severidad | Hallazgo | Corrección |
|---|---|---|---|
| S1 | **Alta** | **Una sesión cerrada seguía funcionando hasta 1 hora.** Al cerrar sesión, cambiar la contraseña, o cuando un admin elimina o bloquea una cuenta, Auth borra la sesión, pero la API de datos (PostgREST) solo revisa la firma del token. Quien tuviera el token (otro dispositivo, una copia robada) seguía leyendo y escribiendo datos hasta que venciera. | `private.check_request_session` corre antes de cada petición (`db_pre_request`) y responde 401 si la sesión ya no existe, venció o la cuenta está bloqueada o borrada. |
| S2 | Media | **El navegador no se enteraba de que la sesión fue revocada** (p. ej. "cerrar sesión" en otro dispositivo): la app seguía mostrando al usuario conectado. | `AuthProvider` confirma la sesión con Auth al volver a la pestaña y cada 5 minutos, y la app cierra la sesión local si la API responde `session_revoked`. |
| S3 | Media | **Datos del usuario anterior quedaban en el navegador** al cerrar sesión: el carrito (guardado por tienda, no por usuario) y el rol activo. En un computador compartido, el siguiente usuario veía y podía comprar el carrito del anterior. La app cerraba sesión en 9 lugares, cada uno con su propia lógica (uno ni siquiera limpiaba los anuncios vistos). | `src/lib/session.ts`: un solo `signOutUser()` que revoca la sesión en todos los dispositivos (`scope: 'global'`), cae a cierre local si no hay conexión, y borra carritos, rol activo y estado del panel. También se limpia cuando la sesión termina por otra vía. |
| S4 | Media | **Suplantación por correo del perfil**: `profiles.email` se podía cambiar desde el navegador. Un usuario podía poner el correo de otra persona o de soporte, y ese es el correo que ven los administradores. | Trigger `trg_profiles_sync_email`: el correo del perfil siempre es el de Auth, y se actualiza solo si el usuario cambia su correo de acceso. |
| S5 | Media | **Publicar a nombre de otro vendedor**: la base fijaba el nombre visible, pero no impedía crear un producto o experiencia con `producer_id`/`host_id` de otra persona, ni cambiar el dueño de uno existente. | Trigger `guard_catalog_owner`: solo el superadmin puede publicar a nombre de otro o cambiar el dueño. |
| S6 | Baja | **Recuperación de contraseña con enlace ajeno** (*login CSRF*): si alguien envía el enlace de recuperación de SU cuenta, la víctima queda dentro de esa cuenta y podría escribir allí sus datos. | La pantalla "Crea una nueva contraseña" muestra a qué correo se aplica y pide no continuar si no es el propio. |
| S7 | Baja | `activities` aceptaba `user_id` y `user_role` del navegador: se podía registrar actividad con un rol que la cuenta no tiene. | Trigger `guard_activity`: siempre el usuario de la sesión y uno de sus roles. Texto limpio y con largo máximo. |
| V1 | Media | **Datos de entrega del pedido sin validar**: `create_store_order` guarda tal cual el JSON del navegador (campos extra, teléfonos con letras, saltos de línea, texto invisible). Esos datos llegan al vendedor. | Trigger `clean_order_shipping`: solo los 6 campos que usa la app, texto limpio, teléfono solo dígitos y largo máximo. El checkout y la reserva también los validan. |
| V2 | Media | **Caracteres invisibles en nombres**: marcas de dirección (U+202E) y espacios de ancho cero permiten que "Cooperativa X" y un nombre visualmente idéntico sean distintos, o que el texto se muestre invertido. | Se quitan en el navegador (`cleanLine` / `cleanMultiline`) y en la base (`private.clean_text`) en perfiles, productos, experiencias, actividad y pedidos. |
| V3 | Baja | **Perfiles sin límites**: nombre, apellido, organización, dirección y ubicación aceptaban cualquier largo; el teléfono, cualquier texto. | Trigger `validate_profile_input` (solo revisa lo que cambia, así un dato antiguo no bloquea editar otra cosa) y restricción `profiles_text_length`. |
| V4 | Baja | **Otras columnas sin límite de formato**: `images.image_url` aceptaba cualquier URL (p. ej. `javascript:`) y `storage_path` con `../`; anuncios sin validar URL ni fechas; `stock`, `unit`, `capacity`, `duration`, `tags`, `transfer_info`, documentos. | Restricciones `CHECK` nuevas. Se crean `NOT VALID` y se validan si los datos actuales cumplen. |
| V5 | Baja | **Formularios con validación incompleta**: el registro pedía 6 caracteres de contraseña (el resto de la app y el texto del campo dicen 8); precios y stock aceptaban negativos o texto; el stock rápido del panel guardaba números negativos; el anuncio aceptaba fin antes del inicio; la reserva aceptaba fechas pasadas escritas a mano (y por usar la hora UTC, después de las 7 p. m. bloqueaba reservar para hoy). | Módulo `src/lib/validation.ts` con las mismas reglas de la base, usado en los formularios de la tabla siguiente, con `maxLength` en los campos. 12 pruebas nuevas. |

## Validación de entradas: dónde se aplica

| Formulario | Reglas |
|---|---|
| Registro, completar perfil | Nombre y apellido (letras), correo, contraseña 8+ con letras y números, documento, ubicación |
| Inicio de sesión, recuperar contraseña | Correo válido; mensaje neutro también ante bloqueo por intentos (429) |
| Mis datos (comprador, productor, admin de tienda, superadmin) | Nombre, apellido, organización, WhatsApp de 10 dígitos, dirección |
| Crear usuario (superadmin, admin de tienda) | Lo anterior + correo |
| Producto | Título, precio, stock entero, descripción (las variantes ya tenían validación) |
| Experiencia | Título, precio, cupos 1–10.000, duración, hasta 20 etiquetas, descripción |
| Stock rápido del panel | Entero entre 0 y 1.000.000 |
| Checkout y reserva | Nombre, celular, departamento, municipio, dirección, notas; fecha de reserva desde hoy; personas entre 1 y el cupo |
| Reseñas, solicitudes de soporte | Largo máximo, sin `<` `>` |
| Anuncios | Título, fin después del inicio, producto o experiencia elegido |
| Agregar rol | Nombre de la organización |

Las reglas del navegador solo avisan antes de enviar. Las que protegen de verdad están en la base,
porque cualquiera puede llamar la API sin pasar por la app.

## Sesiones: cómo queda

- **Cerrar sesión** revoca todas las sesiones de la cuenta (todos los dispositivos), borra los datos
  locales del usuario y recarga la página.
- **Cambiar la contraseña** (o que un admin asigne una temporal): Auth cierra las demás sesiones y,
  con S1, sus tokens dejan de servir de inmediato.
- **Eliminar o bloquear una cuenta**: sus tokens dejan de servir de inmediato.
- **Fijación de sesión**: no aplica. Supabase crea una sesión nueva en cada inicio de sesión, el token
  vive en el almacenamiento del navegador (no en cookies que un tercero pueda fijar) y la app no
  acepta tokens por otra vía que los enlaces de correo de Supabase (ver S6).

**Límites que quedan** (no se cambiaron):
- Storage y Realtime no pasan por `db_pre_request`: un token revocado sigue sirviendo allí hasta vencer
  (1 hora). Para acortarlo, bajar la duración del access token (*JWT expiry*, p. ej. 900 segundos) en la
  configuración de JWT del proyecto en Supabase. La app renueva el token sola.
- Para cerrar sesiones inactivas o limitar su duración: Authentication → Sessions → *Inactivity timeout*
  / *Time-box user sessions* (requiere plan Pro).
- El enlace de recuperación funciona en cualquier navegador (flujo *implicit*). El flujo PKCE evitaría
  S6 del todo, pero el enlace solo funcionaría en el mismo navegador donde se pidió; se dejó así para no
  romper la recuperación desde el celular.

## Verificación

| Prueba (Postgres 16 local con el esquema equivalente) | Resultado |
|---|---|
| Sesión vigente / sesión borrada / cuenta bloqueada / anon | Permitida / 401 `session_revoked` / 401 / permitida |
| Usuario cambia `profiles.email` a `soporte@saki5.com` | Queda el correo de Auth |
| Editar el nombre de un perfil con un teléfono antiguo inválido | Permitido (solo se valida lo que cambia) |
| Teléfono `12` / `300 123 4567` | Rechazado / guardado `3001234567` |
| Nombre con U+202E y espacios de ancho cero | Se guardan limpios |
| Vendedor crea producto con `producer_id` ajeno / cambia el dueño | Rechazado / rechazado. El superadmin sí puede |
| Actividad con `user_id` ajeno y rol `admin` | Se guarda con el usuario y el rol reales |
| Pedido con campos extra, teléfono `+57 300-123-4567` y texto invisible | Solo los 6 campos, teléfono en dígitos, texto limpio |
| Imagen `javascript:...` / `storage_path` con `../` | Rechazadas |
| Migración ejecutada dos veces | Sin errores |
| `tsc`, `eslint`, `vitest`, `vite build` | OK: 59 pruebas (12 nuevas), mismas 19 advertencias de lint que `dev` |

## Cómo aplicar

Ver la guía sin terminal en los archivos del proyecto (`seguridad/despliegue-2026-10-27/`). Con terminal:

```bash
npx supabase db push --linked   # aplica 20261027120000_inputs_y_sesiones
```

Después, publicar la app con el flujo normal (rama → `dev` → `main`).
