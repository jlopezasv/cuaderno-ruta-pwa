# Arquitectura de retención de datos — Cuaderno de Ruta

Documento de diseño para **preparación** de políticas de retención en servidor.  
**No ejecuta borrados**, **no programa cron** y **no modifica datos existentes** salvo configuración explícita del superadmin.

## Objetivos

| Objetivo | Implementación |
|----------|----------------|
| Definir qué se retiene | Tier `RETENIDO` en catálogo + política con días 0 |
| Definir qué es archivable | Tier `ARCHIVABLE` + transición a estado `ARCHIVADO` |
| Definir qué es eliminable | Tier `ELIMINABLE` o fase `BORRABLE` tras archivo |
| Estados de ciclo de vida | `ACTIVO` → `ARCHIVADO` → `BORRABLE` |
| Métricas de espacio | Vista `v_retention_metrics_summary` |
| Simulación de limpieza | RPC `retention_run_simulation` (dry-run) |
| Días de retención | Tabla `retention_policy_config` |

## Estados

```
ACTIVO      — En uso operativo o dentro del mínimo legal/contractual
ARCHIVADO   — Servicio cerrado y fuera de ventana «caliente»; ocultable en UI / storage frío
BORRABLE    — Candidato a purga solo si purge_enabled = true (hoy siempre false)
```

El cómputo de antigüedad usa la fecha de referencia del servicio (`updated_at` / `created_at`) y solo avanza el ciclo si el servicio está **cerrado** (`completado`, `cerrado`, `cancelado`, `anulado`).

## Tiers de política

| Tier | Significado | Ejemplos |
|------|-------------|----------|
| **RETENIDO** | Siempre `ACTIVO`; no purga automática | Metadatos servicio, log envíos, CMR/OCR, GPS vivo, incidencias texto |
| **ARCHIVABLE** | Pasa a frío; borrable tras período adicional | Fotos, PDF, documentos extra/empresa, foto perfil |
| **ELIMINABLE** | Pensado para series densas de bajo valor legal | Trazas GPS históricas (reservado) |

## Clases de activo (catálogo)

Alineadas entre:

- `src/domain/retention/retentionPolicyCatalog.js` (documentación UI)
- `retention_asset_catalog` (SQL)

Incluyen explícitamente: **GPS** (`gps_ubicacion_viva`, `gps_trazas_historicas`), **OCR/CMR** (`evidencia_cmr_ocr`), **fotos** (`evidencia_foto`), **PDF** (`evidencia_pdf`), **documentos** (`servicio_documentos_*`, `documentacion_envios`), **expediente** (`servicio_metadata`).

## Modelo de datos (Supabase)

Migración: `supabase/migrations/20260708120000_data_retention_framework.sql`

| Objeto | Rol |
|--------|-----|
| `retention_framework_meta` | `purge_enabled: false` hasta activación manual |
| `retention_asset_catalog` | Definición de clases y tier |
| `retention_policy_config` | Días por clase (global / futuro por empresa) |
| `retention_simulation_log` | Auditoría de dry-runs |
| `v_retention_metrics_summary` | Agregados por empresa, clase y estado |
| `retention_run_simulation()` | Simula sin `DELETE` ni storage purge |

### Seguridad

- RLS: solo `is_retention_admin()` (= superadmin agenda).
- La función de simulación es `SECURITY DEFINER` y valida el mismo gate.

## Capa aplicación

| Archivo | Rol |
|---------|-----|
| `src/domain/retention/retentionConstants.js` | Estados y tiers |
| `src/domain/retention/retentionPolicyCatalog.js` | Catálogo estático para UI |
| `src/domain/retention/retentionModel.js` | API REST / RPC |
| `src/features/superadmin/PropietarioRetencionPanel.jsx` | Panel propietario |

**Nota:** `src/data/conductorLocalMediaRetention.js` es retención **local** (IndexedDB, 5 días en dispositivo). Es independiente de este marco servidor.

## Flujo de activación futura (no implementado)

1. Revisar métricas y simulaciones en panel **Retención datos**.
2. Ajustar `retention_policy_config` (días).
3. Implementar job/worker que:
   - Lea filas en estado `BORRABLE` con `purge_enabled = true`.
   - Archive storage (fotos/PDF) y marque filas (nunca hard-delete metadatos RETENIDO sin revisión legal).
4. Activar `purge_enabled` en `retention_framework_meta` solo tras aprobación explícita.

## Despliegue

1. Aplicar migración en entorno deseado (Demo primero recomendado).
2. Abrir panel Propietario → **Retención datos**.
3. Ejecutar simulación; verificar `reclaimable_bytes` y desglose por clase.

No se requiere redeploy de Vercel para que SQL funcione; el panel muestra aviso si las tablas no existen.
