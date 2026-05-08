# PROJECT CONTEXT

## Proyecto

Cuaderno de Ruta es una PWA para conductores profesionales y empresas de transporte.

La aplicación combina:
- control de jornada
- normativa tacógrafo
- planificación de rutas
- gestión de servicios
- documentación CMR
- dashboards empresa
- gestión de flota

---

# Objetivo del producto

Crear una plataforma operativa profesional para transporte y logística.

No es una simple app de tacógrafo.

El objetivo es evolucionar hacia:
- gestión operativa completa
- empresas logísticas
- multi conductor
- relevos
- gestores de flota
- seguimiento de servicios
- documentación e informes
- planificación inteligente

---

# Roles actuales

## Conductor
Funciones:
- jornada
- normativa
- ruta
- servicio activo
- evidencias
- CMR
- documentos
- incidencias

## Empresa
Funciones:
- conductores
- servicios
- asignaciones
- dashboard
- documentos
- seguimiento operativo

---

# Stack técnico

## Frontend
- React
- Vite
- JavaScript

## Backend
- Vercel Functions
- Supabase

## Infraestructura
- localStorage
- Supabase
- PWA
- Service Worker

---

# Estado actual del proyecto

La app ya es funcional pero gran parte de la lógica está concentrada en:
src/cuaderno-ruta.jsx

Existe deuda técnica por:
- acoplamiento alto
- mezcla UI + negocio + sync
- contratos API dispersos

El enfoque actual es:
- extracción incremental
- estabilidad
- PRs pequeños
- sin rediseño masivo

---

# Objetivos UX

## Empresa
- experiencia desktop real
- dashboard operativo
- gestión flota clara
- visión global servicios

## Conductor
- experiencia rápida
- móvil first
- mínima fricción
- foco operativo real

---

# Principios del proyecto

- evitar sobreingeniería
- mantener velocidad
- estabilidad primero
- mover primero, mejorar después
- UX pragmática
- enfoque SaaS real

---

# Escalabilidad prevista

La arquitectura debe soportar:
- múltiples empresas
- múltiples gestores
- relevos de conductor
- servicios compartidos
- dashboards agregados
- permisos y roles
- crecimiento gradual
