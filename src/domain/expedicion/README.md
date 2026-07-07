# Dominio Expedición

Capa de dominio para evolucionar Cuaderno de Ruta hacia el modelo DDD sin romper el sistema actual.

## Lenguaje ubicuo

| Dominio | Implementación legacy |
|---------|----------------------|
| Expedición | `servicios` + meta `__SRV_OP__` |
| Parada | `stops` + meta `__CUADERNO_OP__` |
| Inventario | `deca_stock_actual_camion` |
| Movimiento | `deca_movimientos_carga` |
| Carta de Porte (vivo) | `deca_documentos` |

## Principios Fase 2

- Solo cambios aditivos; compatibilidad hacia atrás total.
- Los adapters leen filas legacy; no sustituyen APIs existentes.
- Los commands (próximos commits) delegarán en `autonomoExpedienteApi.js`.

## Referencias

- Hoja de ruta: `docs/FASE1_EVOLUCION_DOMINIO.md`
- Meta servicio: `src/domain/service/serviceOperacionMeta.js`
- Meta parada: `src/domain/service/stopOperacionMeta.js`
