# Planning BC — Transport Obligation

Capa de dominio del **Planning Bounded Context**. Introduce el agregado **Transport Obligation** sin acoplar a cliente, sector ni UI.

## Lenguaje ubicuo

| Dominio | Descripción |
|---------|-------------|
| **Transport Obligation** | Obligación logística a ejecutar; no es pedido comercial ni expedición |
| **Expedition** | Agregado Execution BC (`servicios`); puede vincularse a una obligación |
| **External Reference** | Identificador en sistema origen (ERP, WMS, EDI, API) |

## Principios Sprint 3

- Compatibilidad total con Cuaderno de Ruta actual.
- Sin pantallas ni flujos visibles en esta fase.
- CQRS alineado con `src/domain/expedicion/`.
- Planning no escribe movimientos ni balance (Architecture Freeze v1).

## Referencias

- `docs/ARCHITECTURE_FREEZE_V1.md` (ADR-008 Planning BC)
- `docs/PLANNING_TRANSPORT_OBLIGATION.md` (reglas de dominio)
