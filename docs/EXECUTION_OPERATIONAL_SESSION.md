# Operational Session — Reglas de Dominio
## Execution BC · Sprint 4

**Versión:** 1.0  
**Estado:** Vigente (Architecture Freeze v1 · ADR-003)  
**Código:** `src/domain/execution/`

---

## Definición

**Operational Session** es un intervalo espacio-temporal de operación física sobre una **Expedición**. Representa actividades como carga, descarga, recogida, transferencia, inventario, inspección o precintado.

No es:

- un documento (DeCA, CMR, albarán),
- una pantalla,
- un pedido ni una obligación de Planning.

**Alias legacy congelado:** `operacion_muelle_activa` + `historial_operaciones_muelle` en meta `__SRV_OP__`.

---

## Identidad

| Concepto | Regla |
|----------|-------|
| **OperationalSessionId** | UUID / id generado en apertura muelle (`opId`) |
| **ExpeditionId** | `servicios.id` — toda sesión pertenece a una expedición |
| **Session kind** | Tipo planificado/ejecutado (`load`, `unload`, `pickup`, …) |
| **Location** | Ubicación física (nombre, dirección, rol) |

---

## Ciclo de vida

```
OPEN → CLOSED
  │
  └→ CANCELLED
```

| Estado dominio | Legacy muelle |
|----------------|---------------|
| `open` | `abierta` |
| `closed` | `cerrada` |
| `cancelled` | `anulada` |

---

## Reglas de negocio (congeladas)

| ID | Regla |
|----|-------|
| **OS-01** | Una sesión pertenece a **una única** expedición. |
| **OS-02** | Una expedición puede tener **múltiples** sesiones (activa + historial). |
| **OS-03** | Como máximo **una sesión abierta** activa en meta (`operacion_muelle_activa`). |
| **OS-04** | Una sesión puede contener **múltiples movimientos** (`movementRefs[]`). |
| **OS-05** | Una sesión **cerrada** no admite nuevos movimientos. |
| **OS-06** | Una sesión **cancelada** no admite nuevos movimientos. |
| **OS-07** | Los movimientos de mercancía siguen siendo fuente de verdad en `deca_movimientos_carga`. |
| **OS-08** | El espejo JSON `movimientos[]` en sesión es **derivado**; DeCA es autoritativo. |
| **OS-09** | Operational Session **no altera** balance ni Compliance directamente. |
| **OS-10** | Vocabulario multi-sector: session kinds genéricos, no retail. |

---

## Cadena de lectura

```
Expedición (servicios)
    └── Operational Session (meta muelle)
            └── SessionMovementRef (espejo JSON)
                    └── MovimientoMercancia (deca_movimientos_carga)
```

Query: `ObtenerCadenaMovimientosSesionQuery` — une sesión con movimientos DeCA por `deca_movimiento_id`.

---

## Eventos de dominio

| Evento | Cuándo |
|--------|--------|
| `OperationalSessionOpened` | Apertura sesión |
| `OperationalSessionMovementRegistered` | Ref movimiento en sesión abierta |
| `OperationalSessionClosed` | Cierre sesión |
| `OperationalSessionCancelled` | Cancelación sesión |

*(Persistencia de eventos: fase posterior; agregado puro ya emite eventos.)*

---

## CQRS

### Queries

| Query | Descripción |
|-------|-------------|
| `ObtenerSesionOperativaActivaQuery` | Sesión `open` actual |
| `ListarSesionesOperativasExpedicionQuery` | Activa + historial |
| `ObtenerSesionOperativaQuery` | Por id dentro de expedición |
| `ObtenerCadenaMovimientosSesionQuery` | Sesión + movimientos DeCA |

### Commands (dominio puro / in-memory)

| Command | Nota |
|---------|------|
| `AbrirOperationalSessionCommand` | Dominio; escritura legacy sigue en `autonomoExpedienteApi` |
| `CerrarOperationalSessionCommand` | Idem |
| `CancelarOperationalSessionCommand` | Idem |
| `RegistrarMovimientoEnSesionCommand` | Solo ref dominio; DeCA vía API existente |

Factory runtime:

```javascript
import { expedicionRepository } from "../expedicion";
import { OperationalSessionRepository, createExecutionQueries } from "../execution";
import { movimientoRepository } from "../expedicion";

const sessionRepo = new OperationalSessionRepository(expedicionRepository);
const queries = createExecutionQueries({
  operationalSessionRepository: sessionRepo,
  movimientoRepository,
});
```

---

## Session kinds

| Kind | Uso |
|------|-----|
| `load` | Carga |
| `unload` | Descarga |
| `pickup` | Recogida / retorno |
| `transfer` | Transferencia |
| `inventory` | Inventario |
| `inspection` | Inspección |
| `seal` / `unseal` | Precintado / desprecintado |
| `unspecified` | Legacy `indefinido` |

---

## Ejemplos

### Una expedición, varias sesiones

Expedición `srv-100` con historial de dos entradas en muelle cerradas + una sesión activa en planta aduanera (futuro) → tres registros en `findAllByExpeditionId`.

### Sesión con movimientos

Sesión `op-42` con dos cargas → `movementRefs.length === 2` → `ObtenerCadenaMovimientosSesionQuery` devuelve hasta 2 filas DeCA coincidentes.

### Sesión cerrada

Intento `RegistrarMovimientoEnSesionCommand` sobre sesión `closed` → **OS-R04** (BusinessRuleError).

---

## Compatibilidad

- `ObtenerOperacionMuelleActivaQuery` (expedicion) permanece; Operational Session es capa superior.
- `LegacyOperacionMuelleAdapter.toLegacyOperacionMuelleProjection()` permite bridge gradual.
- Sin cambios en pantallas ni en `autonomoExpedienteApi`.

---

*Documento normativo Execution BC. Cambios vía ADR.*
