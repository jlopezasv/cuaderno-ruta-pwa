# ROADMAP

## Objetivo

Evolucionar Cuaderno de Ruta desde un monolito funcional hacia una arquitectura modular y mantenible, sin romper producción ni rehacer la app.

Enfoque:
- extracción incremental
- PRs pequeños
- estabilidad primero
- sin rediseño masivo
- sin overengineering

---

# FASE 0 — BLINDAJE

## PR-01 — Contratos API
Objetivo:
- detectar endpoints inconsistentes
- alinear frontend/backend
- eliminar acciones huérfanas

Incluye:
- inventario fetch("/api/*")
- revisión actions backend
- normalización api/cmr
- mapa de contratos

Riesgo:
- Medio

---

# FASE 1 — INFRA

## PR-02 — Extraer cliente Supabase
Objetivo:
- mover sbFetch/sbSelect/sbUpsert fuera de cuaderno-ruta.jsx

Archivos nuevos:
- src/data/supabaseClient.js

Riesgo:
- Bajo-Medio

---

## PR-03 — Extraer auth/session
Objetivo:
- separar login/logout/session refresh

Archivos nuevos:
- src/data/session.js

Riesgo:
- Medio

---

## PR-04 — Extraer sync
Objetivo:
- separar sincronización local/cloud
- aislar merge y persistencia

Archivos nuevos:
- src/data/sync.js

Riesgo:
- Medio-Alto

---

## PR-05 — Hardening y observabilidad
Objetivo:
- logs consistentes
- smoke tests
- guardarraíles

Riesgo:
- Bajo

---

# FASE 2 — DOMINIO

## Objetivo
Extraer:
- normativa
- jornada
- planificación
- timeline

a funciones puras y testeables.

Módulos previstos:
- domain/normativa
- domain/planificacion
- domain/jornada

---

# FASE 3 — LAYOUTS

## Objetivo
Separar:
- EmpresaLayout
- ConductorLayout

Sin cambiar todavía comportamiento interno.

Incluye:
- navegación
- topbar
- shells
- responsive desktop/mobile

---

# FASE 4 — FEATURES

## Empresa
- dashboard empresa
- conductores
- servicios
- documentos

## Conductor
- jornada
- servicio activo
- evidencias
- normativa

## Documentos
- CMR
- PDF
- informes
- exportaciones

---

# FASE 5 — ESCALADO

Objetivos:
- multi conductor
- relevos
- gestores de flota
- permisos
- optimización queries
- dashboards agregados
- cacheado

---

# Reglas operativas

- Un PR = una responsabilidad
- No mezclar refactor + rediseño
- Extraer primero, mejorar después
- PRs pequeños y reversibles
- Smoke tests obligatorios