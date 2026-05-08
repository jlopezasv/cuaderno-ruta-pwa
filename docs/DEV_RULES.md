Playbook Operativo (PRs Graduales y Seguros)
Enfoque: simple, ejecutable, sin burocracia.
Objetivo: extraer por capas sin romper producción.

1) Template estándar de PR
Copia/pega este bloque en cada PR:

## Objetivo
Qué problema resuelve este PR y por qué ahora.
## Alcance (In / Out)
- In:
  - ...
- Out (explícitamente NO incluido):
  - ...
## Cambios realizados
- ...
- ...
## Archivos afectados
- `src/...`
- `api/...`
- `docs/...`
## Riesgo
- Nivel: Bajo / Medio / Alto
- Riesgo principal:
- Mitigación aplicada:
## Dependencias
- Depende de: #PR-XXX (si aplica)
- Bloquea a: #PR-YYY (si aplica)
## Compatibilidad y UX
- ¿Cambia UX visible? Sí/No
- Si sí, detalle mínimo:
- Si no, confirmar: “cambio interno”
## Rollback plan
- Reversión: revertir commit/PR completo
- Señal de rollback:
- Impacto esperado del rollback:
## Smoke tests ejecutados
- [ ] Arranque app
- [ ] Login/logout
- [ ] Crear/editar registro jornada
- [ ] Persistencia tras recarga
- [ ] Sync básico con Supabase
- [ ] Módulo empresa básico (si aplica)
- [ ] Endpoints tocados responden OK
## Evidencias
- Capturas/logs breves:
- Casos probados:
## Criterios de merge
- [ ] Sin cambios de alcance ocultos
- [ ] Sin regresiones funcionales visibles
- [ ] Smoke tests en verde
- [ ] Rollback claro
- [ ] Revisión aprobada
2) Template checklist QA manual
## QA Manual - PR #___
### A. Flujo base
- [ ] La app abre sin errores de consola críticos
- [ ] Navegación principal sigue igual
- [ ] No hay cambios visuales no planificados
### B. Auth/sesión
- [ ] Login correcto
- [ ] Error controlado en credenciales inválidas
- [ ] Logout limpia sesión correctamente
- [ ] Recarga mantiene sesión si corresponde
### C. Datos/sync
- [ ] Crear dato nuevo y verificar persistencia tras reload
- [ ] Editar dato y verificar persistencia
- [ ] No aparecen duplicados tras sync
- [ ] Fallback razonable si falla red/API
### D. Módulos tocados por PR
- [ ] Caso 1:
- [ ] Caso 2:
- [ ] Caso 3:
### E. Resultado
- [ ] QA Aprobado
- [ ] QA con observaciones (listar)
3) Template de validación post-deploy
## Post-Deploy Validation - Release ___
### 0-15 minutos
- [ ] App carga correctamente
- [ ] Login/logout funciona
- [ ] Flujo principal del día (jornada) funciona
- [ ] Endpoint(s) tocados responden OK
### 15-60 minutos
- [ ] Persistencia y recarga correctas
- [ ] Sync sin errores graves
- [ ] Módulo empresa básico estable
### Monitoreo rápido
- [ ] No aumento de errores críticos
- [ ] No quejas de usuarios en canales internos
- [ ] No degradación evidente de rendimiento
### Decisión
- [ ] Mantener release
- [ ] Hotfix
- [ ] Rollback
4) Reglas de oro para no romper producción
Un PR = una responsabilidad.
Extraer primero, cambiar comportamiento después.
No mezclar refactor interno + rediseño visual.
Mantener firmas de funciones al extraer.
Si no se puede validar en 20-30 min de smoke, el PR es demasiado grande.
Todo PR debe tener rollback trivial.
Ante duda de contrato API, primero estabilizar contrato.
Evitar “limpieza masiva” sin valor funcional inmediato.
5) Convenciones mínimas por carpeta
data/: acceso a datos externos (Supabase/API/localStorage), sync, repositorios.
domain/: reglas de negocio puras (sin fetch, sin React, sin window).
features/: casos de uso por vertical (empresa, conductor, servicios, docs).
layouts/: estructura/página shell (top nav, bottom nav, composición).
shared/: utilidades y componentes reutilizables cross-feature.
Regla clave: UI no llama directamente a infraestructura si ya existe capa data/.

6) Naming conventions
Hooks: useXxx (useSession, useAppSync, useNormativaEngine)
Repositorios: xxxRepo (entriesRepo, profilesRepo)
Servicios: xxxService (authService, syncService)
Layouts: XxxLayout (EmpresaLayout, ConductorLayout)
Componentes: XxxView, XxxPanel, XxxCard, XxxModal
Consistencia > perfección.

7) Límites por PR (anti-caos)
Tamaño recomendado: 150–400 líneas netas.
Archivos recomendados: 3–10.
Máximo absoluto (excepcional): ~600 líneas / 15 archivos.
No mezclar más de 1 área principal:
Contratos API
Extracción data
Extracción domain
Ajuste UI
Si necesitas explicar demasiado el PR, probablemente está sobredimensionado.
8) Señales: deuda saludable vs sobreingeniería
Deuda saludable

Menos código acoplado por PR.
Menos lógica crítica en cuaderno-ruta.jsx.
Más funciones puras testables.
PRs pequeños, previsibles y reversibles.
Sobreingeniería peligrosa

Nuevas capas sin uso real inmediato.
“Framework interno” inventado.
Renombrados masivos sin valor funcional.
PRs grandes que tocan todo “porque sí”.
9) Prácticas a evitar en transición
Big-bang refactor.
Cambiar UX mientras extraes infra.
Abstracciones genéricas prematuras.
“Ya que estamos…” (scope creep).
Reescribir componentes grandes sin hipótesis validada.
10) Cómo mantener velocidad mientras refactorizas
70/30: 70% feature delivery, 30% extracción técnica (o 80/20 según presión).
“Boy scout rule” controlada: mejora local donde tocas, no global.
PRs cortos y frecuentes (1-2 días).
Definir siempre “out of scope”.
Tener checklist smoke fijo y rápido.
Priorizar mejoras que reducen fricción diaria (auth/sync/contracts primero).
