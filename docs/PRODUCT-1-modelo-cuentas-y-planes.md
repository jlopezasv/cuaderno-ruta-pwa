# PR PRODUCT-1 — Modelo definitivo de cuentas y planes

**Proyecto:** Cuaderno de Ruta PWA  
**Estado:** Propuesta técnica para validación (sin implementar)  
**Relacionado con:** AUTH-1 (login automático, can_drive, conmutador híbrido)

---

## 1. Objetivo

Separar correctamente tres tipos de producto sin romper la arquitectura actual y sin regalar capacidades enterprise:

| Tipo | Nombre |
|------|--------|
| 1 | Conductor |
| 2 | Autónomo PRO |
| 3 | Empresa |

---

## 2. Modelo de producto (definición funcional)

### TIPO 1 — CONDUCTOR

Usuario operativo puro.

**Puede:**
- Jornada y conducción
- OCR
- Incidencias
- Documentos operativos
- Copiloto
- Servicio asignado (por empresa)

**No puede:**
- Crear servicios
- Gestionar documentos globales
- Informes enterprise
- Clientes (módulo empresa)
- Panel empresa
- Gestión avanzada / coordinación de flota

**Shell:** Panel Conductor únicamente.

---

### TIPO 2 — AUTÓNOMO PRO

Profesional independiente. **NO es empresa.**

**Puede:**
- Crear **sus** servicios
- Gestionar **sus** documentos
- Histórico personal
- OCR completo
- Correo de **sus** expedientes
- Panel Docs avanzado (ámbito propio)
- Gestión operativa propia

**No puede:**
- Crear usuarios / invitar conductores
- Gestionar conductores de flota
- Permisos multiusuario
- Informes enterprise
- Dashboards multiusuario
- Coordinación de flota / tráfico
- Administración global

**Objetivo de producto:** “Super conductor profesional”, no empresa.

**Shell:** Panel Conductor únicamente.

---

### TIPO 3 — EMPRESA

Gestión multiusuario (enterprise).

**Puede:**
- Conductores, asignaciones, coordinación
- Informes, clientes, dashboards
- Permisos, documentos globales
- Tráfico, administración

**Modo híbrido (opcional):**  
Si activa en configuración `can_drive = true`, puede alternar:

- **Modo Empresa** → gestión
- **Modo Conductor** → operación (sin permisos enterprise en ese modo)

**Shell:** Panel Empresa por defecto; Panel Conductor solo si `can_drive = true`.

---

## 3. Regla de arquitectura: separar conceptos

No mezclar en un solo campo:

| Concepto | Qué es | Dónde vive |
|----------|--------|------------|
| Tipo de cuenta | Producto contratado | `profiles.tipo_cuenta` |
| Capacidades | Qué módulos puede usar | Resolución en app + RLS |
| Plan comercial | Facturación (futuro) | Tabla `subscriptions` / Stripe |
| Shell activo | Qué interfaz ve ahora | `activeMode` en sesión (caché) |
| Modo híbrido | Empresa que también conduce | `can_drive` + conmutador |

---

## 4. Modelo de datos propuesto

### 4.1. `profiles.tipo_cuenta`

Valores estándar:

- `conductor`
- `autonomo_pro`
- `empresa`

*(Migrar `autonomo` legacy → `autonomo_pro` donde corresponda.)*

### 4.2. `profiles.can_drive` (ya implementado en AUTH-1)

- `boolean NOT NULL DEFAULT false`
- Solo relevante para `tipo_cuenta = empresa`
- Activación oficial: **Empresa → Configuración → Perfil** → “También conduzco con esta cuenta”
- **No** preguntar en el registro

**Migración conservadora (aprobada):**
- `tipo_cuenta` autónomo/conductor → `can_drive = true`
- `tipo_cuenta` empresa → `can_drive = false`
- Sin inferencias por `entries` ni actividad reciente

**Demo:** cuenta empresa demo con `can_drive = true` para validar conmutador.

### 4.3. `profiles.empresa_status` (nuevo — solo Empresa)

Solo cuentas `tipo_cuenta = empresa`:

| Valor | Significado |
|-------|-------------|
| `pending` | Registro empresa, pendiente validación |
| `approved` | Acceso modo Empresa en producción |
| `rejected` | Rechazada |

**Solo en producción** se aplica bloqueo por estado.  
**En Demo:** acceso libre para pruebas (sin bloqueo).

---

## 5. Resolución de capacidades (propuesta)

### Capacidad “shell empresa”

```text
empresa_shell =
  tipo_cuenta === "empresa"
  AND (Demo OR empresa_status === "approved")
```

**No** inferir por `empresas.owner_id` ni por filas en BD para decidir el shell.

### Capacidad “shell conductor”

```text
conductor_shell =
  tipo_cuenta === "conductor"
  OR tipo_cuenta === "autonomo_pro"
  OR (tipo_cuenta === "empresa" AND can_drive === true)
  OR vínculo activo conductor_empresa (conductor de flota ajena)
```

### Conmutador Empresa ↔ Conductor

```text
mostrar_conmutador =
  tipo_cuenta === "empresa"
  AND can_drive === true
  AND empresa_shell permitido (o siempre en demo)
```

### Capacidad “crear servicios propios”

```text
puede_crear_servicios =
  tipo_cuenta === "autonomo_pro"
  AND activeMode === "conductor"
```

**No** para `conductor` (solo asignados).  
**No** para `empresa` en modo Conductor (operación pura).

---

## 6. Matriz de permisos por tipo

| Funcionalidad | Conductor | Autónomo PRO | Empresa (modo Empresa) | Empresa (modo Conductor) |
|---------------|-----------|--------------|------------------------|--------------------------|
| Jornada / conducción | Sí | Sí | No | Sí (si can_drive) |
| OCR / incidencias | Sí | Sí | No | Sí |
| Servicio asignado | Sí | Sí | No | Sí |
| Crear servicios propios | No | Sí | Sí (flota) | **No** |
| Panel empresa | No | No | Sí | No |
| Conductores / asignaciones | No | No | Sí | No |
| Informes / clientes enterprise | No | No | Sí | No |
| Docs globales empresa | No | No | Sí | No |
| Conmutador | No | No | Si can_drive | Si can_drive |

---

## 7. Validación empresa (producción)

### Registro Empresa

- `tipo_cuenta = empresa`
- `empresa_status = pending`
- `can_drive = false`
- Acceso inmediato a onboarding / mensaje “pendiente de validación” según política UX

### Registro Autónomo PRO

- `tipo_cuenta = autonomo_pro`
- Acceso inmediato
- **No** requiere `empresa_status`

### Registro Conductor

- `tipo_cuenta = conductor`
- Acceso inmediato

### Política pendiente de confirmar (A vs B)

**Opción A (recomendada):** Si `empresa_status != approved` en producción:
- Bloquear **modo Empresa**
- Permitir **modo Conductor** si `can_drive = true`

**Opción B:** Si no approved, bloquear toda la app.

---

## 8. Registro nuevo (UI)

Opciones visibles en registro:

1. **Conductor**
2. **Autónomo PRO**
3. **Empresa**

Sin selector Empresa/Conductor en login (AUTH-1).  
Sin pregunta “¿También conduces?” en registro.

---

## 9. AUTH-1 — Estado actual e impacto PRODUCT-1

### Ya implementado (develop)

- Login solo email + contraseña
- `resolveAccountCapabilities` + revalidación backend
- `activeMode` en localStorage (caché)
- Conmutador cabecera para híbridos (`empresa && conductor`)
- Eliminada pestaña FLOTA embebida en conductor
- `can_drive` explícito en perfiles
- Primera visita híbrida → Empresa; después último modo

### Cambios necesarios con PRODUCT-1

1. **`resolveAccountCapabilities`:** capacidad empresa solo si `tipo_cuenta === empresa` (no por owner_id).
2. **Registro:** tres opciones Conductor / Autónomo PRO / Empresa.
3. **`empresa_status`:** columna + gate en producción.
4. **`TabServicio` / `CrearServicioModal`:** “Crear servicio” solo Autónomo PRO.
5. **Docs conductor:** ocultar módulos enterprise para todos excepto lógica propia Autónomo PRO.
6. **RLS `user_can_insert_servicio`:** revisar que Autónomo PRO pueda crear servicio propio (`conductor_id = auth.uid`) sin ser owner de empresa.
7. **Migración `tipo_cuenta`:** `autonomo` → `autonomo_pro` donde aplique.

---

## 10. Autónomo PRO — Creación de servicios (técnico)

Hoy existe `CrearServicioModal` en panel conductor (crear servicio propio).

**Propuesta:**
- Visible solo si `tipo_cuenta === autonomo_pro`.
- Payload: `conductor_id = auth.uid`, estado `asignado` (no “pendiente sin conductor” de flota).
- `empresa_id`: resolver por vínculo o contexto personal, **sin** abrir panel empresa.

**Riesgo actual:** `user_can_insert_servicio` permite insert si `p_conductor_id = auth.uid` con `empresa_id` null o con owner — validar en Supabase que Autónomo PRO no necesite fila en `empresas` como owner.

---

## 11. Plan de implementación sugerido (fases)

### Fase 1 — Datos y AUTH
- Migración `tipo_cuenta` valores + `empresa_status`
- Actualizar `resolveAccountCapabilities`
- Registro 3 opciones
- Gate producción `empresa_status`

### Fase 2 — UI permisos
- Ocultar “Crear servicio” según tipo
- Ocultar docs enterprise en conductor
- Revisar `EmpresaPanel` solo en shell empresa

### Fase 3 — RLS y pruebas
- Ajustar políticas INSERT servicios para autonomo_pro
- Tests Demo: conductor, autonomo_pro, empresa sin can_drive, empresa con can_drive
- Tests producción: pending / approved

---

## 12. SQL de referencia — can_drive (ya aplicable en Demo)

```sql
-- Capacidad explícita de operar como conductor (panel jornada/servicio).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_drive boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_drive IS
  'Si true: el usuario puede usar el panel conductor. Para tipo_cuenta=empresa activa el modo híbrido.';

UPDATE public.profiles
SET can_drive = true
WHERE tipo_cuenta IN ('autonomo', 'conductor');

UPDATE public.profiles
SET can_drive = false
WHERE tipo_cuenta = 'empresa';

-- Demo empresa híbrida:
-- UPDATE public.profiles SET can_drive = true
-- WHERE id = '<uuid-demo-empresa>';
```

---

## 13. Commits de referencia (develop)

| PR | Commit (aprox.) | Contenido |
|----|-----------------|-----------|
| AUTH-1 inicial | `02d3f2c` | Login automático, conmutador, sin FLOTA |
| AUTH-1 can_drive | `dbca14d` | can_drive explícito, toggle en perfil empresa |

**Demo:** https://cuaderno-demo-ab.vercel.app  
**Producción:** https://tacografo-pro.vercel.app

---

## 14. Decisiones aprobadas (resumen)

| # | Decisión | Estado |
|---|----------|--------|
| 1 | Conmutador híbrido en cabecera | Aprobado |
| 2 | Primera visita → Empresa, sin modal | Aprobado |
| 3 | Eliminar FLOTA embebida en conductor | Aprobado |
| 4 | Cambio de modo sin logout | Aprobado |
| 5 | can_drive explícito, no inferir por entries | Aprobado |
| 6 | Toggle solo en Empresa → Configuración → Perfil | Aprobado |
| 7 | empresa_status solo producción; Demo libre | Propuesto |
| 8 | Tres tipos registro: Conductor / Autónomo PRO / Empresa | Propuesto |
| 9 | Política pending: Opción A vs B | **Pendiente confirmar** |

---

*Documento generado para validación interna — Cuaderno de Ruta — PRODUCT-1*
