# Entorno DEMO — separación total de producción

Objetivo: **cero contaminación** entre datos, auth, storage y despliegues reales y de demostración.

| Capa | Producción | Demo |
|------|------------|------|
| Vercel | Proyecto `cuaderno-ruta` (o nombre real) | Proyecto **nuevo** `cuaderno-demo` |
| Supabase | `glyexutcypmhkndvmcxd` (REAL) | Proyecto **nuevo** (otro `ref`) |
| Auth | Usuarios reales | Solo cuentas seed + registro **cerrado** |
| Storage | Buckets reales | Buckets **vacíos** en proyecto demo |
| Firebase/FCM | Proyecto real | Vacío o proyecto Firebase demo |
| Stripe / Brevo | Claves live / prod | **Sin configurar** o sandbox |

---

## 1. Checklist de separación (completa)

### A. Cuentas y proyectos (infra)

- [ ] Crear proyecto Supabase **nuevo** (región EU si prod está en EU).
- [ ] Anotar `DEMO_PROJECT_REF` ≠ `glyexutcypmhkndvmcxd`.
- [ ] Crear proyecto Vercel **nuevo** (no usar el mismo `projectId` que producción).
- [ ] Dominio demo dedicado (ej. `demo.cuaderno.app` o `cuaderno-demo.vercel.app`).
- [ ] **No** enlazar el repo demo al mismo “Production” que prod sin revisar variables.
- [ ] Firebase/FCM: proyecto separado o variables vacías en demo.
- [ ] Stripe: **no** poner `STRIPE_SECRET_KEY` live en demo.
- [ ] Brevo/email: vacío en demo o lista de prueba aislada.

### B. Variables de entorno (cero compartidas)

- [ ] Copiar plantilla [`.env.demo.example`](../.env.demo.example) → Vercel **solo proyecto demo**.
- [ ] `VITE_APP_ENV=demo` y `APP_ENV=demo` en **todo** el proyecto Vercel demo.
- [ ] `VITE_DEMO_SUPABASE_PROJECT_REF` = ref demo (validación positiva en runtime).
- [ ] `VITE_SUPABASE_URL` / `SUPABASE_*` = **solo** URLs/keys del proyecto demo.
- [ ] **Prohibido** en demo: `VITE_ALLOW_PROD_SUPABASE`, `ALLOW_PROD_SUPABASE`.
- [ ] **Prohibido** en demo: pegar `service_role` de producción.
- [ ] Producción: `VITE_ALLOW_PROD_SUPABASE=1` + `ALLOW_PROD_SUPABASE=1` solo en Vercel **prod real**.
- [ ] Revisar Preview de Vercel prod: si usa preview, debe apuntar a Supabase demo o fallar el guard (ref real bloqueado sin opt-in).

### C. Base de datos demo

- [ ] Aplicar migraciones: `supabase/migrations/*.sql` (o `scripts/demo-safe-align.sql` si hay error ownership).
- [ ] Comparar drift: [scripts/SUPABASE-REAL-vs-DEMO.md](../scripts/SUPABASE-REAL-vs-DEMO.md).
- [ ] Buckets: [scripts/demo-storage-buckets.sql](../scripts/demo-storage-buckets.sql).
- [ ] Políticas storage: migración `20260515190000_storage_and_legacy_rls.sql`.

### D. Auth demo

- [ ] Dashboard → **Authentication → Providers → Email**: habilitar email.
- [ ] Dashboard → **Authentication → Settings**: **Disable new sign ups** (registro libre OFF).
- [ ] Opcional: desactivar “Confirm email” para QA (`demo-*.test`).
- [ ] Ejecutar [scripts/seed-demo-auth.sql](../scripts/seed-demo-auth.sql) (usuarios fijos).
- [ ] Ejecutar [scripts/seed-demo.sql](../scripts/seed-demo.sql) (datos operativos fake).
- [ ] App (develop/demo): pestaña “Crear cuenta” **habilitada** si `VITE_APP_ENV=demo` (`isDemoPublicRegistrationAllowed()`). Revertir con `false` en `appEnvironment.js`.
- [ ] Supabase demo → Authentication: **Enable sign ups** (si no, `signUp` falla aunque la UI esté abierta).

### E. Storage demo

- [ ] Buckets `user-photos`, `cmr`, `expediente_firma` en proyecto **demo** (privados).
- [ ] **No** sincronizar objetos desde prod (ni copiar paths con UIDs reales).
- [ ] URLs firmadas solo contra host `*.supabase.co` del ref demo.

### F. Usuarios y datos precreados

| Rol | Email | Contraseña |
|-----|-------|------------|
| Empresa | `demo-empresa@cuaderno.test` | `DemoCuaderno2026!` |
| Conductor | `demo-conductor@cuaderno.test` | `DemoCuaderno2026!` |

UUIDs fijos: ver cabecera de `scripts/seed-demo.sql`.

### G. Bloqueos en aplicación (defensa en profundidad)

- [ ] Cliente: si `VITE_APP_ENV=demo` y URL contiene ref REAL → **error al arrancar**.
- [ ] API: si `APP_ENV=demo` y `SUPABASE_URL` es REAL → **error**.
- [ ] `signUp()` en demo: permitido mientras `isDemoPublicRegistrationAllowed()` sea `true` (`session.js` + `isPublicRegistrationAllowed()`).
- [ ] Login demo muestra credenciales seed (banner azul).
- [ ] `ALLOW_PURGE_TEST_COMPANY` solo en no-production (ya existente).

### H. Operaciones y proceso

- [ ] Documentar URL demo en README interno.
- [ ] Rotar keys demo si se filtran (sin afectar prod).
- [ ] Nunca ejecutar `seed-demo-reset.sql` contra prod.
- [ ] Nunca ejecutar `compare-supabase-inventory` con `SUPABASE_DB_URL` de prod como destino de escritura.

### I. Verificación final (smoke)

- [ ] Abrir demo → consola sin error de ref REAL.
- [ ] Login empresa demo → flota con servicios seed.
- [ ] Subir foto/CMR → objeto solo en bucket demo (inspeccionar URL: host demo).
- [ ] Intentar registro → UI sin tab / error si se fuerza API.
- [ ] En prod: comprobar que demo URL **no** está en `ALLOWED_ORIGIN` de prod salvo necesidad.

---

## 2. Variables de entorno demo

Plantilla completa: [`.env.demo.example`](../.env.demo.example).

| Variable | Obligatoria demo | Notas |
|----------|------------------|-------|
| `VITE_APP_ENV` | Sí = `demo` | Activa guards + UI demo |
| `APP_ENV` | Sí = `demo` | Guards en `api/*` |
| `VITE_DEMO_SUPABASE_PROJECT_REF` | Recomendada | Debe coincidir con URL |
| `VITE_SUPABASE_URL` | Sí | Host `YOUR_DEMO_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Sí | Anon **demo** |
| `SUPABASE_URL` | Sí | Mismo proyecto que Vite |
| `SUPABASE_ANON_KEY` | Sí | Mismo anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Service role **solo demo** |
| `ALLOWED_ORIGIN` | Recomendada | URL pública del deploy demo |
| `ADMIN_PANEL_USER_IDS` | Opcional | UID owner seed |

**Nunca en demo:** `VITE_ALLOW_PROD_SUPABASE`, `ALLOW_PROD_SUPABASE`, keys Stripe live, service role prod.

---

## 3. Auth demo

1. Proyecto Supabase demo → Authentication.
2. **Disable sign ups** (canal principal de bloqueo).
3. `seed-demo-auth.sql` crea dos usuarios con password `DemoCuaderno2026!`.
4. En demo/develop la app puede mostrar “Crear cuenta” (incl. empresa) si `isDemoPublicRegistrationAllowed()` es `true`; en producción el comportamiento no cambia.

Recuperación de contraseña: en demo dejar desactivada o usar solo cuentas seed (evitar emails a dominios reales vía Brevo prod).

---

## 4. Storage demo

1. Ejecutar `scripts/demo-storage-buckets.sql` en el proyecto demo.
2. Aplicar RLS storage (`20260515190000_storage_and_legacy_rls.sql` o `demo-safe-align.sql`).
3. Buckets privados (`public = false`).

La app sube a `user-photos`, `cmr`, `expediente_firma`. Todas las URLs deben contener el **ref demo**, nunca `glyexutcypmhkndvmcxd`.

---

## 5. Usuarios demo precreados

Orden de ejecución en SQL Editor (**proyecto demo**):

```text
1. supabase/migrations (o demo-safe-align.sql)
2. scripts/demo-storage-buckets.sql
3. scripts/seed-demo-auth.sql
4. scripts/seed-demo.sql
```

Reset solo demo: `scripts/seed-demo-reset.sql` → auth → seed.

---

## 6. Bloqueo de registro libre

| Capa | Acción |
|------|--------|
| Supabase Dashboard | Disable new sign ups |
| Frontend (demo) | Tab “Crear cuenta” visible si `isDemoPublicRegistrationAllowed()` |
| `signUp()` (demo) | Permitido si `isPublicRegistrationAllowed()` → demo branch |
| Frontend (prod) | Sin cambio: no es `VITE_APP_ENV=demo` |
| Opcional prod | No definir `VITE_ALLOW_PUBLIC_SIGNUP` (default permitido en prod) |

---

## 7. Flujo seguro de deploy demo

### 7.1 Crear Supabase demo (una vez)

1. New project → nombre `cuaderno-demo`.
2. Guardar URL, anon, service_role en gestor de secretos **etiquetado DEMO**.
3. SQL: migraciones → `demo-storage-buckets.sql` → `seed-demo-auth.sql` → `seed-demo.sql`.
4. Auth: disable sign ups.

### 7.2 Crear Vercel demo (una vez)

1. **Add New Project** → mismo repo Git, nombre `cuaderno-demo`.
2. Framework: Vite (igual que prod).
3. **Environment Variables** → pegar desde `.env.demo.example` con valores demo.
4. **No** copiar env desde proyecto Vercel de producción.
5. Deploy branch: `main` o `demo` dedicada.

### 7.3 Deploy rutinario

```bash
git push origin main   # si demo sigue main
# o
git push origin demo   # rama solo demo
```

Vercel demo construye con `VITE_*` demo → bundle **no** puede hablar con prod si el guard y las vars son correctos.

### 7.4 Desarrollo local contra demo

```bash
cp .env.demo.example .env.local
# Rellenar keys del proyecto Supabase demo
# Editar .env.local: VITE_APP_ENV=demo
npm run dev
```

### 7.5 Rollback / rotación

- Rotar anon/service_role en Supabase demo → actualizar solo Vercel demo.
- Prod no se toca.

---

## 8. Guardas en código (referencia)

| Archivo | Comportamiento |
|---------|----------------|
| `src/data/supabaseClient.js` | Bloquea ref REAL en demo; exige ref demo si `VITE_DEMO_SUPABASE_PROJECT_REF` |
| `api/lib/supabaseEnv.js` | Igual en serverless |
| `src/config/appEnvironment.js` | `isDemoApp()`, credenciales hint |
| `src/data/session.js` | Bloquea `signUp` en demo |

Producción sigue requiriendo `VITE_ALLOW_PROD_SUPABASE=1` cuando la URL es el ref real.

---

## 9. Qué NO hacer (anti-patrones)

- Usar el mismo proyecto Vercel con vars distintas solo en Preview (riesgo de mezcla).
- Apuntar demo a Supabase prod “para tener datos”.
- Copiar `service_role` prod al portapapeles del equipo comercial.
- Habilitar registro abierto en demo para “probar onboarding”.
- Sincronizar buckets prod → demo con usuarios reales (RGPD).

---

## 10. Enlaces útiles del repo

- [SUPABASE-REAL-vs-DEMO.md](../scripts/SUPABASE-REAL-vs-DEMO.md) — alinear esquema
- [demo-safe-align.sql](../scripts/demo-safe-align.sql) — migrar sin ownership legacy
- [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) — storage y RLS
