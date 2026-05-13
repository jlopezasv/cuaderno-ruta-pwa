# Push FCM Setup (PR-75)

## 1) Variables de entorno

Configura estas variables en Vercel (Project Settings -> Environment Variables):

- `FCM_SERVER_KEY` (Firebase Cloud Messaging legacy server key; opcional si usas solo HTTP v1)
- `GOOGLE_APPLICATION_CREDENTIALS` (JSON en una línea de la cuenta de servicio Firebase para FCM HTTP v1; opcional si usas solo legacy)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` (opcional; si no está, usa la URL actual del proyecto)

Y en frontend (`.env`):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`

## 2) Tabla Supabase para tokens

El upsert del API usa `onConflict: 'token'`: hace falta **una única restricción UNIQUE sobre `token`**. Si el mismo dispositivo pasa a otro conductor, la fila se actualiza (`user_id`, `platform`, etc.) sin 409.

```sql
create table if not exists public.push_tokens (
  id bigserial primary key,
  user_id uuid not null,
  token text not null,
  platform text,
  pwa_installed boolean default false,
  ua text,
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_key unique (token)
);

create index if not exists idx_push_tokens_user_updated
  on public.push_tokens(user_id, updated_at desc);
```

Si ya creaste la tabla con `unique (user_id, token)` y además tienes conflicto con `token` global, alinea el esquema con lo anterior (una sola unique en `token`) para que coincida con el cliente `upsert(..., { onConflict: 'token' })`.

**`updated_at`:** debe existir la columna con `default now()`; el API siempre envía `updated_at` en cada registro para forzar el “touch” en upsert.

## 3) Envío FCM (backend)

Logs en Vercel / servidor con prefijo **`[push-send]`**.

**Método (orden de prioridad):**

1. **`FCM_SERVER_KEY`** (clave servidor legacy) → envío a `https://fcm.googleapis.com/fcm/send`
2. Si no hay legacy: **`GOOGLE_APPLICATION_CREDENTIALS`** (JSON completo de cuenta de servicio Firebase) → HTTP v1 `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`

No se registran valores secretos; solo longitud / presencia.

**Prueba manual (usuario autenticado):**

```http
POST /api/push?action=test_send
Authorization: Bearer <access_token de Supabase>
Content-Type: application/json

{"title":"Opcional","body":"Opcional"}
```

Responde con `channel`, `cleanup` y cuerpo de respuesta FCM (truncado en JSON de error).

## 4) Flujo implementado

- Conductor inicia sesión -> cliente pide permisos y registra token FCM.
- Token se guarda en `push_tokens`.
- Empresa asigna servicio -> `/api/push` (`notify_assignment`) busca tokens del conductor, envía FCM y registra `[push-send]`.
- Click en notificación -> abre app y fuerza navegación a `/?tab=servicio`.
