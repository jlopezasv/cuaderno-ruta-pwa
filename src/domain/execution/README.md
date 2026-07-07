# Execution BC — Operational Session

Capa de dominio para **Operational Session**: intervalo espacio-temporal de operación física sobre una **Expedición**.

## Lenguaje ubicuo

| Dominio | Alias legacy |
|---------|--------------|
| **Operational Session** | `operacion_muelle_activa` / `historial_operaciones_muelle` |
| **Session kind** | `tipo_previsto` |
| **Movement ref** | Entrada en `movimientos[]` espejo + `deca_movimiento_id` |

## Principios Sprint 4

- Capa de dominio sobre implementación muelle existente.
- Sin pantallas ni cambio de comportamiento visible.
- CQRS alineado con `src/domain/expedicion/` y `src/domain/planning/`.

## Referencias

- `docs/ARCHITECTURE_FREEZE_V1.md` (ADR-003 Operación / sesión operativa)
- `docs/EXECUTION_OPERATIONAL_SESSION.md`
