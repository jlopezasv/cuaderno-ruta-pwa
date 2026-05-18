# Hardening Fase 1 — Separación REAL / DEMO / LOCAL

Elimina URLs y anon keys hardcodeadas. Cada entorno define su propio proyecto Supabase.

## Variables obligatorias

### Cliente (Vite)

| Variable | Dónde | Entorno |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | `.env.local`, Vercel | Local, Preview, Production |
| `VITE_SUPABASE_ANON_KEY` | `.env.local`, Vercel | Local, Preview, Production |

Fuente única: `src/config/env.js` → reexportada como `SB_URL` / `SB_KEY` en `src/data/supabaseClient.js`.

Si faltan → **error en startup** al cargar la app.

### API (Vercel Serverless)

| Variable | Dónde |
|----------|--------|
| `SUPABASE_URL` | Vercel, `.env.local` (vercel dev) |
| `SUPABASE_ANON_KEY` | Vercel, `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo operaciones admin/push/stripe server |

Fuente: `api/lib/supabaseEnv.js` (sin fallback a producción).

---

## Configuración Vercel (ejemplo)

En **Settings → Environment Variables**:

### Production (REAL)

| Name | Value | Environment |
|------|--------|-------------|
| `VITE_SUPABASE_URL` | `https://<REF_REAL>.supabase.co` | Production |
| `VITE_SUPABASE_ANON_KEY` | anon key REAL | Production |
| `SUPABASE_URL` | mismo URL | Production |
| `SUPABASE_ANON_KEY` | misma anon key | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | service role REAL | Production |

### Preview (DEMO / PRs)

| Name | Value | Environment |
|------|--------|-------------|
| `VITE_SUPABASE_URL` | `https://<REF_DEMO>.supabase.co` | Preview |
| `VITE_SUPABASE_ANON_KEY` | anon key DEMO | Preview |
| `SUPABASE_URL` | mismo URL DEMO | Preview |
| `SUPABASE_ANON_KEY` | misma anon DEMO | Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | service role DEMO | Preview |

### Development (opcional en Vercel)

Si usas `vercel dev`, duplica las variables DEMO en **Development**.

**Importante:** `VITE_*` se inlined en el bundle en **build time**. Tras cambiar variables en Vercel, hay que **redeploy** el entorno afectado.

---

## Desarrollo local

```bash
cp .env.local.example .env.local
# Editar .env.local con credenciales del proyecto DEMO
npm run dev
```

---

## Checklist de migración segura

### Antes del deploy

- [ ] Crear o confirmar proyecto Supabase **DEMO** separado de REAL.
- [ ] Aplicar `scripts/demo-safe-align.sql` en DEMO si el esquema diverge.
- [ ] Rotar anon key en REAL si estuvo expuesta en el repositorio (histórico).
- [ ] Copiar `.env.local.example` → `.env.local` con refs **DEMO** para desarrollo.

### Vercel

- [ ] Añadir `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` en **Production** (REAL).
- [ ] Añadir las mismas cuatro variables `SUPABASE_*` en Production para APIs.
- [ ] Añadir el conjunto completo en **Preview** apuntando a DEMO.
- [ ] Eliminar variables obsoletas `NEXT_PUBLIC_SUPABASE_*` si existían duplicadas.
- [ ] Redeploy Production y un Preview de prueba.

### Verificación

- [ ] `npm run build` local con `.env.local` DEMO → build OK.
- [ ] Abrir app local → login contra DEMO (comprobar ref en Network: URL del proyecto).
- [ ] Production: login y un servicio de prueba contra REAL.
- [ ] Preview: confirmar que no aparece tráfico al ref REAL en DevTools.
- [ ] `/api/stripe`, `/api/push`, `/api/admin`: sin 500 por `supabase_not_configured`.

### Rollback

- [ ] Mantener screenshot de variables Vercel anteriores.
- [ ] Revertir commit de Fase 1 y redeploy si es crítico (restauraría hardcodes — no recomendado).

---

## Qué se eliminó en código

- `src/data/supabaseClient.js`: URL y anon key en claro.
- `window.__SB_URL__` y fallback en `cuaderno-ruta.jsx`.
- Fetch directo a URL REAL en flujo `subscriptions` (pago).
- Fallbacks en `api/admin.js`, `api/stripe.js`, `api/push.mjs`.

## Qué NO cambia en Fase 1

- Lógica de negocio, RLS, uploads, monolito `cuaderno-ruta.jsx`.
- `APP_URL` fijo en stripe (Fase 2).
- Firebase / Anthropic keys (siguen por env separadas).

---

## Diagnóstico

En consola del navegador (solo dev), tras login:

```js
// El hostname de las peticiones REST debe coincidir con tu .env.local
```

Errores típicos:

| Mensaje | Causa |
|---------|--------|
| `Falta VITE_SUPABASE_URL` | Sin `.env.local` o sin redeploy Vercel |
| `[Cuaderno API] Variables obligatorias` | API sin `SUPABASE_URL` en Vercel |
| `VITE_SUPABASE_URL no tiene formato válido` | URL mal escrita o con path extra |
