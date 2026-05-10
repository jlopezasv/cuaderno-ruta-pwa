# WORKFLOW OPERATIVO REAL ACTUAL (Servicio)

## 1. Introducción breve

En el estado actual de la app, un **Servicio** es una orden operativa asociada a un conductor, con origen, destino y una secuencia de paradas (`stops`).  
Cada parada puede tener evidencias (CMR, foto, incidencia).  
La empresa crea/asigna servicios y supervisa; el conductor ejecuta el ciclo operativo en campo.

Relaciones actuales:

- **Servicio -> conductor**: un `conductor_id` principal.
- **Servicio -> stops**: lista ordenada de paradas.
- **Stop -> evidencias**: documentos/eventos visuales y de incidencia.
- **Empresa -> servicio**: crea/asigna y consulta estado/documentación.

## 2. Flujo operativo actual real (creación -> cierre)

1. **Creación**
   - La empresa asigna un servicio a un conductor, o el conductor crea su propio servicio.
   - El servicio se guarda con `estado: "asignado"`.
   - Las paradas se guardan con `estado: "pendiente"`.

2. **Inicio de servicio**
   - El conductor inicia manualmente el servicio.
   - Transición: `asignado -> en_curso`.

3. **Ejecución por parada**
   - En cada stop:
     - Marca llegada: `pendiente -> llegado`.
     - Registra evidencias si aplica (CMR, foto, incidencia).
     - Marca salida/completado: `llegado -> completado`.

4. **Cierre**
   - Cuando ya no quedan stops en `pendiente`, el servicio pasa a `completado`.
   - No hay botón separado de cierre; el cierre es consecuencia de completar paradas.

## 3. Estados reales actuales

### Servicio

- `asignado`
- `en_curso`
- `completado`
- `cancelado` (existe en vocabulario UI, pero sin flujo operativo activo en handlers actuales)

### Stops

- `pendiente`
- `llegado`
- `completado`

## 4. Qué hace el conductor

- Inicia servicio.
- Marca llegada y salida/completado de cada parada.
- Registra evidencias en parada:
  - CMR
  - Foto
  - Incidencia
- Consulta el estado y progreso de su servicio activo.

## 5. Qué hace la empresa

- Crea/asigna servicios a conductores vinculados.
- Consulta estado de servicios y avance de paradas.
- Consulta documentación/evidencias por servicio.
- No opera llegada/salida de paradas desde la UI actual.

## 6. Qué sigue siendo manual

- Inicio de servicio.
- Llegada y salida de cada stop.
- Carga de evidencias (CMR/foto/incidencia).
- Parte del refresco operacional en paneles de seguimiento.
- No hay cancelación operativa de servicio desde el flujo actual.

## 7. Side effects actuales

- Al completar ciertos tipos de parada (`carga`, `descarga`, `parada_tecnica`) se generan automáticamente eventos de tacógrafo (`entries`) de inicio/fin de actividad asociada.
- Se muestran toasts de confirmación en acciones clave (inicio, llegada, completado, guardado de evidencia).
- Hay recargas puntuales de datos tras acciones concretas.

## 8. Huecos operativos detectados

- `cancelado` está definido pero no tiene transición operativa implementada.
- No hay flujo explícito de reasignación o anulación de servicio dentro del ciclo normal.
- El acoplamiento con tacógrafo existe en completado de parada, pero no cubre todo el ciclo del servicio.
- Parte de la supervisión depende de recarga y no de actualización continua.

## 9. Riesgos si se automatiza demasiado pronto

- Romper operativas manuales que hoy son válidas en campo.
- Forzar un único flujo donde hoy hay variaciones operativas.
- Introducir bloqueos en pasos críticos (llegada/salida/evidencias).
- Acoplar en exceso servicio y tacógrafo sin validar casos reales.

## 10. Posibles evoluciones futuras (muy breves y conservadoras)

- Activar cancelación operativa real con reglas mínimas y reversibles.
- Unificar criterios de refresco/consistencia entre vistas conductor/empresa.
- Mejorar trazabilidad de side effects automáticos sin cambiar el workflow base.
