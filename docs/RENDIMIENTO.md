# Auditoría de rendimiento — Cuaderno de Ruta

**Fecha:** 2026-06-05  
**Alcance:** Frontend Vite/React, PostgREST (`sbFetch`), polling, bundle de producción  
**Método:** Análisis estático de código y configuración de build. Sin profiling APM ni `EXPLAIN ANALYZE` en BD.

---

## Resumen ejecutivo

| Área | Severidad | Síntoma principal |
|------|-----------|-------------------|
| Monolito `cuaderno-ruta.jsx` (~18k LOC) | **Crítica** | Parse JS lento, re-renders amplios |
| Polling masivo (sin Realtime) | **Alta** | Tráfico REST redundante en flota y conductor |
| N+1 queries empresa/conductores | **Alta** | Latencia crece linealmente con flota |
| `pdf-lib` en chunk principal | **Alta** | +600 KB aunque no se use expediente |
| Reloj 1 Hz + `calcNorma` | **Media** | 60 recálculos/min en tacógrafo activo |
| Mensajes chat sin `limit` | **Media** | Descarga completa cada 30 s |

**Build actual (referencia):** chunk `cuaderno-ruta-*.js` ~1,96 MB minificado / ~611 KB gzip.

---

## 1. Componentes React más pesados

| Componente | Líneas | Hooks (aprox.) | Riesgo perf. | Impacto | Prob. | Solución |
|------------|--------|----------------|--------------|---------|-------|----------|
| `src/cuaderno-ruta.jsx` | **18.265** | **~102** | **Crítico** | Crítico | **Alta** | Dividir en rutas lazy: tacógrafo, empresa, conductor, mapas |
| `ActiveServicePanel.jsx` | 2.236 | 13 | Alto | Alto | Alta | Ya extraído; seguir dividiendo detalle vs lista |
| `EmpresaDcdtModal.jsx` | 1.334 | 41 | Alto | Medio | Media | Lazy import; cargar PDF solo al abrir |
| `ConductorSimplifiedParadasTab.jsx` | 973 | 29 | Medio | Alto | Alta | OK estructura; reducir polls en detalle |
| `SendDocumentationModal.jsx` | 1.062 | — | Medio | Medio | Media | Lazy + worker para PDF |
| `EmpresaFlotaServicioCard.jsx` | 995 | 8 | Medio | Alto | Alta | Virtualizar lista; defer expand fetch |
| `PlanificadorMapaBeta.jsx` | 673 | — | Medio | Medio | Media | Lazy Leaflet (ya CDN); una sola carga |
| `EmpresaEstadisticasPanel.jsx` | — | 7× `useMemo` | Alto | Medio | Media | Paginar en servidor; no 500 servicios en cliente |

### 1.1 Patrón de carga

```
App.jsx
  └─ lazy(cuaderno-ruta.jsx)  ← un solo chunk ~2 MB
       └─ 40+ imports estáticos (PDF, DCDT, empresa, mapas…)
```

| Aspecto | Riesgo | Impacto | Prob. | Solución |
|---------|--------|---------|-------|----------|
| Un solo `React.lazy` | Alto | Alto | Alta | `React.lazy` por shell: `EmpresaLayout`, `ConductorShell`, `TacografoCore` |
| Sin code-split por feature | Alto | Alto | Alta | `manualChunks` para `pdf-lib`, `dcdt`, `empresa-flota` |

---

## 2. Consultas y patrones de red más costosos

### 2.1 Top 15 por impacto estimado

| # | Patrón | Ubicación | Coste | Riesgo | Impacto | Prob. | Solución |
|---|--------|-----------|-------|--------|---------|-------|----------|
| 1 | Login sync **5000 entries** + 1000 docs | `cuaderno-ruta.jsx` ~2348 | Muy alto (payload) | Alto | Alto | Alta en login | Sync incremental; solo rango fecha |
| 2 | `loadConductores`: N×(profile + **2000 entries** + calcNorma) | ~13361 | Muy alto | Alto | Alto | Alta | Batch RPC; cache entries por día |
| 3 | Flota poll **120 s**: servicios + stops + merge | ~14185, `empresaFlotaRefresh.js` | Alto | Alto | Alto | Alta | Supabase Realtime o debounce 5 min |
| 4 | Ubicación poll **90 s**: **1 fetch/conductor** | ~14031 | Alto (O(n)) | Alto | Alto | Alta | RPC `latest_ubicaciones_by_empresa` |
| 5 | Dashboard ubicaciones **75 s** + Photon geocode | ~19073 | Alto | Medio | Media | Media | Cache geocode; batch ubicaciones |
| 6 | `useServicioActivo` reload **30 s** | ~17335 | Alto | Medio | Alta | Full `cargar()` servicio+stops+evs |
| 7 | `listServiceMessages` **sin limit**, poll 30 s | `serviceMessagesApi.js:17`, `useServiceMessagesUnread.js` | Medio | Medio | Alta | `select=id,created_at,sender_user_id` + count RPC |
| 8 | DCDT poll **20 s** mientras incompleto | `useConductorDcdtQuickStatus.js` | Medio | Medio | Media | Backoff exponencial |
| 9 | Evidencias bulk `stop_id=in.(...)` sin limit | ~13623 | Alto | Medio | Media | Lazy por stop expandido |
| 10 | Estadísticas: 500 servicios + chunks evidencias | `empresaEstadisticasModel.js` | Alto | Medio | Media | Vista materializada / RPC agregados |
| 11 | `fetchFlotaServiciosForEmpresa` chunks de 40 UIDs | `servicioAssignment.js` | Medio | Medio | Media | Una query con join |
| 12 | `empresaFlotaLists`: 1 profile/conductor | `empresaFlotaLists.js:63` | Medio | Medio | Alta | `profiles?id=in.(...)` batch |
| 13 | Card expand: incidencias + evidencias | `EmpresaFlotaServicioCard.jsx:185` | Medio | Medio | Media | On-demand con skeleton |
| 14 | Participación tiempos: **5000 entries**/conductor | `loadParticipacionTiemposServicio.js` | Alto | Bajo | Baja | Agregar en SQL |
| 15 | `resolveDriverFlatPendingStops`: secuencial por servicio | `driverFlatStopList.js` | Medio | Medio | Alta | Paralelizar con límite; RPC única |

### 2.2 Polling / timers (inventario)

| Intervalo | Archivo | Propósito | Riesgo | Solución |
|-----------|---------|-----------|--------|----------|
| **1000 ms** | `cuaderno-ruta.jsx:2419` | Reloj tacógrafo | **Alto** | `requestAnimationFrame` o contexto aislado |
| **650 ms × 12** | ~7905, ~13695 | Poll código equipo | Medio | Webhook o Realtime |
| **20 s** | ~2529 | SW keepalive | Bajo | OK |
| **30 s** | ~17335, `useServiceMessagesUnread` | Servicio activo / chat | Alto | Realtime + visibility pause |
| **75 s** | ~19073 | Dashboard GPS | Alto | Batch RPC |
| **90 s** | ~14186 | Flota ubicación | Alto | Batch RPC |
| **120 s** | ~14185 | Flota servicios | Alto | Realtime parcial |
| **3 min** | `useAutoOperationalEtaToFirstDescarga` | ETA | Bajo | OK |
| **6 h** | ~2202 | Retention sweep | Bajo | OK |

### 2.3 Ausencia de Realtime

Documentado en `docs/RESUMEN_EJECUTIVO_AUDITORIA.md`: no hay `supabase.channel()`. Todo es poll → multiplica carga con usuarios concurrentes.

| Riesgo | Impacto | Prob. | Solución |
|--------|---------|-------|----------|
| Alto | Alto en escala | Alta | Realtime en `servicios`, `stops`, `service_messages`, `ubicaciones` |

---

## 3. Bundle y assets

### 3.1 Configuración Vite (`vite.config.js`)

| Aspecto | Estado | Riesgo | Solución |
|---------|--------|--------|----------|
| `manualChunks`: react, firebase, supabase | Parcial | Medio | Añadir `pdf-lib`, `qrcode` |
| `sourcemap: false` | OK prod | — | — |
| `target: es2019, safari14` | OK PWA | — | — |

### 3.2 Dependencias pesadas en chunk principal

| Librería | Import | Tamaño estimado | Riesgo | Solución |
|----------|--------|-----------------|--------|----------|
| `pdf-lib` | Estático vía `serviceExpediente`, `EmpresaDcdtModal` | ~300–500 KB | **Alto** | `import()` dinámico |
| `qrcode` | Estático en `decaQrImage.js` | ~50 KB | Medio | Dynamic en modal QR |
| Leaflet | CDN runtime (×3 lugares) | Red + main thread | Medio | Un loader compartido |
| `@supabase/supabase-js` | Chunk separado pero **no usado** en runtime (`sbFetch` custom) | Dead weight | Bajo | Eliminar si no se usa |

### 3.3 Build output (referencia)

| Asset | Tamaño gzip | Nota |
|-------|-------------|------|
| `cuaderno-ruta-*.js` | ~611 KB | Por encima del umbral 500 KB de Vite |
| `react-*.js` | ~45 KB | OK |
| `firebase-*.js` | ~16 KB | OK |

---

## 4. CPU en cliente (main thread)

| Patrón | Ubicación | Riesgo | Impacto | Prob. | Solución |
|--------|-----------|--------|---------|-------|----------|
| `calcNorma` cada tick 1 Hz | ~2463–2504 | **Alto** | Medio en móvil | Alta | Recalcular solo si entries cambian |
| 7× `useMemo` encadenados estadísticas | `EmpresaEstadisticasPanel` | Alto | Medio | Media | Web Worker o servidor |
| Generación PDF expediente | `serviceExpediente.js` | Alto | Alto | Media | Worker + progress UI |
| Canvas resize imágenes evidencia | Varios | Medio | Medio | Media | `createImageBitmap` + worker |
| `watchPosition` continuo GPS | ~10445 | Medio | Batería | Alta | `maximumAge` + throttle |

---

## 5. Base de datos (consultas costosas inferidas)

Sin métricas de prod; patrones que **probablemente** más cargan Postgres:

| Consulta / objeto | Por qué es costosa | Riesgo | Solución |
|-------------------|-------------------|--------|----------|
| `user_can_access_servicio()` en cada fila RLS | Invocada en SELECT masivos | Alto | Índices en `servicio_asignaciones(conductor_id, servicio_id)` |
| `evidencias` con `datos` JSON grande | SELECT * sin proyección | Alto | Columnas generadas / storage externo |
| `entries` 2000–5000 filas por usuario | Sin índice compuesto `(user_id, ts DESC)` | Medio | Índice + limit en API |
| Vista `v_retention_metrics_summary` | Agregación cross-tenant | Alto | Materialized view + refresh programado |
| `stops?servicio_id=eq` sin limit | Servicios con muchas paradas | Bajo | Limit razonable (ej. 200) |

**Recomendación:** ejecutar en REAL:

```sql
-- pg_stat_statements (si habilitado en Supabase)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

---

## 6. PWA / Service Worker

| Aspecto | Riesgo | Impacto | Solución |
|---------|--------|---------|----------|
| SW keepalive 20 s | Bajo | Batería | Aumentar intervalo en background |
| Cache estrategia assets | Medio | Stale deploy | `skipWaiting` + version hash |
| Push abre tab vía postMessage | Bajo | — | OK |

---

## 7. Plan de mejora por fases

### Fase 1 — Quick wins (1–2 sprints)

1. Dynamic import `pdf-lib` y modales DCDT/expediente  
2. Batch `profiles?id=in.(...)` en flota  
3. `listServiceMessages`: proyección mínima + `limit=100`  
4. Pausar polls cuando `document.visibilityState === 'hidden'` (parcialmente hecho en unread)  
5. RPC `ubicaciones_latest_by_empresa(empresa_id)`

### Fase 2 — Estructural (1–2 meses)

1. Dividir `cuaderno-ruta.jsx` en shells lazy  
2. Supabase Realtime para flota y mensajes  
3. Login sync incremental (solo últimos 7 días entries)  
4. Virtualización lista flota (`react-window`)

### Fase 3 — Escala

1. Vistas materializadas estadísticas / retención  
2. CDN para PDFs generados  
3. APM (Vercel Analytics + Supabase logs)

---

## 8. Métricas objetivo sugeridas

| Métrica | Actual (est.) | Objetivo |
|---------|---------------|----------|
| LCP móvil 4G | No medido | < 2,5 s |
| Chunk inicial gzip | ~612 KB | < 350 KB |
| Requests/min panel empresa (10 conductores) | ~15–25 | < 5 |
| Tiempo login (entries sync) | 2–8 s | < 1,5 s |
| TBT tacógrafo activo | Alto (1 Hz) | < 100 ms |

---

*Auditoría estática. Validar con Lighthouse, WebPageTest y `pg_stat_statements` en entorno REAL.*
