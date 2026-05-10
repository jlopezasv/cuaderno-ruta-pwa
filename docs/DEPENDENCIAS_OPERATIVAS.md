# DEPENDENCIAS OPERATIVAS (MAPA REAL)

## 1. Introducción breve

Una **dependencia operativa** es cualquier condición externa o interna que debe cumplirse para que el Servicio pueda avanzar o cerrarse correctamente.  
Estas dependencias generan bloqueos y retrasos cuando fallan, porque obligan a parar, replanificar o validar manualmente.

## 2. Dependencias antes de salida

- **De qué depende**: disponibilidad real de conductor/vehículo, datos mínimos del servicio, documentación básica.
- **Quién depende de ello**: empresa, conductor, cliente.
- **Qué pasa si falla**: salida tardía, cambio de secuencia, riesgo de incumplir ventana inicial.
- **Cómo se resuelve hoy**: confirmación manual previa y ajuste operativo por llamada/mensajería.

## 3. Dependencias en carga

- **De qué depende**: acceso a muelle, turno asignado, mercancía preparada y aceptada.
- **Quién depende de ello**: conductor, almacén de carga, empresa.
- **Qué pasa si falla**: espera prolongada, incidencia en origen, desviación del plan de ruta.
- **Cómo se resuelve hoy**: espera en sitio, escalado operativo y decisión humana (continuar/reprogramar).

## 4. Dependencias en ruta

- **De qué depende**: estado real de vías, restricciones temporales, continuidad segura del viaje.
- **Quién depende de ello**: conductor, empresa, cliente, operador logístico.
- **Qué pasa si falla**: pérdida de ETA, desvíos no previstos, arrastre de retrasos.
- **Cómo se resuelve hoy**: coordinación directa y ajuste manual de prioridades y secuencia.

## 5. Dependencias documentales

- **De qué depende**: evidencia suficiente (CMR/fotos/incidencias) y consistencia con lo ejecutado.
- **Quién depende de ello**: conductor, empresa, cliente, administración operativa.
- **Qué pasa si falla**: cierre documental pendiente, disputas o retrabajo.
- **Cómo se resuelve hoy**: recaptura/corrección manual y validación posterior.

## 6. Dependencias en descarga

- **De qué depende**: disponibilidad de recepción, aceptación de mercancía, validación de entrega.
- **Quién depende de ello**: conductor, cliente final, empresa.
- **Qué pasa si falla**: no entrega parcial/total, necesidad de nueva ventana o parada extra.
- **Cómo se resuelve hoy**: coordinación humana con cliente/empresa e incidencia operativa.

## 7. Dependencias humanas/comunicación

- **De qué depende**: confirmaciones claras entre actores y trazabilidad mínima de decisiones.
- **Quién depende de ello**: todos los actores operativos.
- **Qué pasa si falla**: versiones distintas, llamadas repetidas, decisiones tardías.
- **Cómo se resuelve hoy**: llamada directa, recapitulación manual y confirmación explícita.

## 8. Dependencias de conductor/vehículo

- **De qué depende**: estado físico del conductor, tiempos operativos, estado técnico de vehículo/remolque.
- **Quién depende de ello**: conductor, empresa, cliente.
- **Qué pasa si falla**: interrupción del servicio, reasignación de hecho o reprogramación.
- **Cómo se resuelve hoy**: decisión humana inmediata y ajuste manual de operación.

## 9. Dependencias de cierre

- **De qué depende**: paradas completadas, incidencias tratadas y documentación mínima aceptable.
- **Quién depende de ello**: empresa, cliente, administración operativa.
- **Qué pasa si falla**: cierre parcial, reapertura administrativa o validación diferida.
- **Cómo se resuelve hoy**: revisión manual final y regularización documental.

## 10. Qué sigue totalmente manual

- Verificación de precondiciones antes de arrancar.
- Resolución de bloqueos en carga/descarga con terceros.
- Priorización ante múltiples dependencias en conflicto.
- Consolidación de evidencia y cierre administrativo.

## 11. Qué NO automatizar todavía

- Cierre automático por checklist incompleto o ambiguo.
- Reasignación automática sin validación humana.
- Resolución automática de conflictos multi-actor.
- Dependencias rígidas que no contemplen casos reales de campo.

## 12. Posibles evoluciones futuras (muy breves)

- Registro mínimo de bloqueos por dependencia (tipo, impacto, resolución).
- Mayor trazabilidad de dependencias críticas entre conductor y empresa.
- Criterios simples de cierre operativo-documental sin cambiar el flujo base.
