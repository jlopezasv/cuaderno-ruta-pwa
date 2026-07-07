# Transport Obligation — Reglas de Dominio
## Planning BC · Sprint 3

**Versión:** 1.0  
**Estado:** Vigente (Architecture Freeze v1 + Sprint 3)  
**Código:** `src/domain/planning/`

---

## Definición

**Transport Obligation** es una obligación logística que debe ejecutarse mediante el transporte. No es:

- un pedido comercial,
- una expedición,
- un documento (DeCA, hoja de carga, albarán).

Es el contrato de dominio entre **sistemas externos** (ERP, WMS, EDI, API) y **Cuaderno de Ruta** (Execution BC).

---

## Identidad

| Concepto | Regla |
|----------|-------|
| **TransportObligationId** | UUID; identidad de dominio |
| **ExternalReference** | Referencia en sistema origen; no sustituye identidad |
| **EmpresaId** | Tenant (Resource BC); nullable en recepción ACL |

Una obligación es **única por identidad de dominio**. Dos registros con el mismo `externalId` de distintos tenants son obligaciones distintas.

---

## Ciclo de vida

```
RECEIVED → PLANNED → IN_EXECUTION → PARTIALLY_FULFILLED → FULFILLED
    │          │            │                  │
    └──────────┴────────────┴──────────────────┴→ CANCELLED
    └──────────┴────────────┴──────────────────┴→ SUPERSEDED (replan / split / merge)
```

| Estado | Significado |
|--------|-------------|
| `received` | Recibida de conector externo; sin plan de ejecución |
| `planned` | Planificada; puede generar o vincular expediciones |
| `in_execution` | Al menos una expedición vinculada en curso |
| `partially_fulfilled` | Parte ejecutada; queda trabajo |
| `fulfilled` | Totalmente ejecutada |
| `cancelled` | Cancelada; no se ejecutará |
| `superseded` | Sustituida (replanificación, división o agrupación) |

---

## Reglas de negocio (congeladas)

### Relación con Expedición (Execution BC)

| ID | Regla |
|----|-------|
| **TO-01** | Una obligación **puede generar varias expediciones** (`expeditionIds[]`). |
| **TO-02** | Una expedición **pertenece como máximo a una** Transport Obligation (`UNIQUE(servicio_id)` en junction). |
| **TO-03** | Vincular expedición **no altera** movimientos, inventario ni DeCA. |
| **TO-04** | Expedición sin vínculo es válida (autónomo, operación manual). |
| **TO-05** | Retorno parcial **permanece en la misma expedición**; no abre obligación nueva. |

### Ejecución parcial y replanificación

| ID | Regla |
|----|-------|
| **TO-06** | Una obligación **puede permanecer parcialmente ejecutada** (`partially_fulfilled`). |
| **TO-07** | Replanificar marca la obligación actual como `superseded` y crea reemplazo `planned`. |
| **TO-08** | Dividir (`split`) marca padre `superseded` y registra hijas por identidad. |
| **TO-09** | Agrupar (`merge`) marca origen `superseded` con `mergedIntoObligationId`. |
| **TO-10** | Cancelar obligación **no cancela** expediciones ya en Execution; es decisión Planning. |

### Límites arquitectónicos (ADR Freeze)

| ID | Regla |
|----|-------|
| **TO-11** | Planning **no escribe** `deca_movimientos_carga` ni balance a bordo. |
| **TO-12** | Planning **no duplica** paradas como verdad; referencia Execution vía expedición. |
| **TO-13** | Documentos legales permanecen en **Compliance BC**. |
| **TO-14** | Vocabulario retail (pedido tienda, hoja de carga) **prohibido** en dominio Planning. |

---

## Eventos de dominio

| Evento | Cuándo |
|--------|--------|
| `TransportObligationReceived` | Creación desde conector o manual |
| `TransportObligationPlanned` | Transición a planificada |
| `ExpeditionLinkedToTransportObligation` | Vínculo 1:N obligación → expedición |
| `TransportObligationExecutionStarted` | Primera expedición vinculada |
| `TransportObligationPartiallyFulfilled` | Ejecución incompleta confirmada |
| `TransportObligationFulfilled` | Cierre total |
| `TransportObligationCancelled` | Cancelación |
| `TransportObligationReplanned` | Replanificación |
| `TransportObligationSplit` | División |
| `TransportObligationMerged` | Agrupación |

Eventos persistidos en `transport_obligation_events` (append-only).

---

## Persistencia

| Artefacto | Rol |
|-----------|-----|
| `transport_obligations` | Fuente de verdad del agregado |
| `transport_obligation_expeditions` | Junction expedición ↔ obligación |
| `transport_obligation_events` | Log de eventos |
| Meta `transport_obligation_id` en `__SRV_OP__` | Espejo opcional lectura; junction es autoritativa |

---

## CQRS

### Queries

- `ObtenerTransportObligationQuery`
- `ListarTransportObligationsPorEmpresaQuery`
- `ObtenerObligationPorExpedicionQuery`

### Commands

- `CrearTransportObligationCommand`
- `PlanificarTransportObligationCommand`
- `VincularExpedicionObligationCommand`
- `CancelarTransportObligationCommand`
- `ReplanificarTransportObligationCommand`

Factories: `createPlanningQueries()`, `createPlanningCommands()`.

---

## Ejemplos de escenarios

### Una obligación → varias expediciones

Obligación `TO-100` (distribución semanal) genera:

- Expedición lunes `srv-mon`
- Expedición miércoles `srv-wed`

Ambas en `expeditionIds`; junction con `UNIQUE(servicio_id)` cada una apunta a `TO-100`.

### Una expedición → una obligación

`srv-42` vinculada a `TO-200`. Intento de vincular `srv-42` a `TO-201` → **TO-R07** (BusinessRuleError).

### Ejecución parcial

`TO-300` con dos expediciones: una `fulfilled`, otra `en_curso` → estado obligación `partially_fulfilled`.

### Replanificación

`TO-400` en `planned` → `ReplanificarTransportObligationCommand` →

- `TO-400` → `superseded`
- `TO-400-r1` → `planned`, `replanVersion: 1`

---

## Conectores (fase posterior)

Puertos definidos en `src/domain/planning/ports/`. Sin implementación en Sprint 3.

| Puerto | Origen |
|--------|--------|
| `ErpConnectorPort` | ERP |
| `WmsConnectorPort` | WMS |
| `EdiConnectorPort` | EDI |
| `ApiConnectorPort` | REST/API genérica |
| `PlanningIntegrationPort` | Orquestador ACL |

---

## Migración SQL

```bash
node scripts/apply-sql-file.mjs supabase/migrations/20260731120000_transport_obligations.sql
```

---

*Documento normativo Planning BC. Cambios arquitectónicos vía ADR.*
