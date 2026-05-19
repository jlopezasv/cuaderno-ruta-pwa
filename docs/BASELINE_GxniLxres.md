# Baseline oficial — deployment GxniLxres (15 mayo 2026)

**ID Vercel:** `dpl_GxniLXresRk4e87cpNCnsQMQCpwP`  
**Alias producción:** https://tacografo-pro.vercel.app  
**Creado:** 2026-05-15 00:00:20 CET

Este deployment es la **referencia operacional** del proyecto. El código en disco debe alinearse en **bootstrap Supabase y capas de entorno**, sin reintroducir hardening/debug posteriores.

## Comportamiento del baseline (verificado en bundle)

| Aspecto | GxniLxres |
|---------|-----------|
| Supabase cliente | URL + anon **embebidos** (`glyexutcypmhkndvmcxd`) |
| `src/config/env.js` | **No** |
| `main.jsx` import env | **No** |
| BUILD DEBUG / ENV_AUDIT | **No** |
| Splash | «CUADERNO DE RUTA» |
| Arranque sin `VITE_*` en Vercel | **Sí** (no exige variables para build) |

## Código actual (post-alineación)

- `src/data/supabaseClient.js` — defaults = mismo URL/anon que GxniLxres; `VITE_*` opcionales.
- `api/lib/supabaseEnv.js` — `SUPABASE_*` opcionales con mismos defaults; `SERVICE_ROLE` sigue obligatoria donde la API la necesite.
- Lógica de negocio posterior (PDF, ETA, expediente, etc.) **se conserva** en fuente; no forma parte del baseline de entorno.

## Qué no replicar del workspace reciente

- `readRequiredVite` / fallo en startup por falta de `VITE_SUPABASE_URL`
- Banners, envAudit, guards JWT cross-project, split DEMO/PROD documental
