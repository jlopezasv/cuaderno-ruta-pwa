# ACTORES OPERATIVOS (MAPA REAL)

## 1. Introducción breve

Un **actor operativo** es cualquier persona o entidad que interviene de forma directa en la ejecución de un Servicio.  
Cada actor puede alterar tiempos, decisiones y evidencias del flujo operativo, por lo que impacta en el resultado final del servicio.

## 2. Actores actuales reales

- conductor
- empresa transporte
- gestor de tráfico
- operador logístico
- almacén carga
- almacén descarga
- cliente final
- aduanas
- policía/inspección

## 3. Qué puede hacer cada actor hoy

> Nota: esta sección distingue capacidad operativa real en campo y capacidad actual en la app.

- **Conductor**
  - Iniciar servicio.
  - Marcar llegada/salida de parada.
  - Registrar incidencia.
  - Subir documentación/evidencias (foto, CMR, incidencia).
  - Consultar estado de su servicio.

- **Empresa transporte (jefe/gestión)**
  - Crear/asignar servicio a conductor vinculado.
  - Consultar estado y avance de servicios.
  - Consultar documentación/evidencias por servicio.

- **Gestor de tráfico / operador logístico**
  - Coordinar cambios operativos (normalmente por comunicación externa).
  - Priorizar decisiones de ruta, espera o secuencia.
  - En el estado actual, suele actuar a través de empresa/conductor, no como rol técnico separado en la app.

- **Almacén carga / almacén descarga**
  - Validar acceso, turno y operación física.
  - Confirmar o rechazar carga/descarga en operación real.
  - Puede originar incidencias (espera, muelle, rechazo).

- **Cliente final**
  - Aceptar o rechazar entrega.
  - Solicitar documentación o correcciones.

- **Aduanas / policía / inspección**
  - Requerir parada, documentación o inspección.
  - Puede bloquear continuidad temporal del servicio.

## 4. Qué información necesita cada actor

- **Conductor**: parada actual, siguiente parada, estado del servicio, instrucciones operativas, evidencias pendientes.
- **Empresa/gestión**: estado global por conductor, incidencias abiertas, progreso por parada, documentación disponible.
- **Operador/gestor externo**: ETA/avance, bloqueos, capacidad de replanificación.
- **Almacenes/cliente**: referencia, hora estimada, documentación mínima de recepción/entrega.
- **Autoridades**: identificación del transporte y documentos requeridos por control.

## 5. Qué problemas reales aparecen entre actores

- Información asimétrica (no todos ven lo mismo al mismo tiempo).
- Cambios de última hora no reflejados de forma estructurada.
- Dependencia de comunicación externa (llamadas/mensajería) para decisiones críticas.
- Tiempos de espera y validaciones de terceros fuera del control del conductor.
- Diferencias entre evidencia disponible y lo solicitado por cliente/operador.

## 6. Qué sigue siendo manual hoy

- Coordinación entre empresa, conductor, almacén y cliente.
- Confirmaciones operativas de carga/descarga.
- Resolución de incidencias y priorización de acciones.
- Validación humana de documentación en casos críticos.

## 7. Qué dependencias humanas existen todavía

- Decisión final ante incidencias (continuar, esperar, desviar, cerrar parcial).
- Confirmación de entrega/recepción por terceros.
- Alineación entre planificación y realidad de campo.
- Escalado de problemas con cliente, operador o autoridades.

## 8. Qué NO automatizar todavía

- Asignación rígida de responsabilidades entre actores.
- Resolución automática de incidencias multi-actor.
- Replanificación automática obligatoria sin validación humana.
- Flujos de aprobación complejos tipo enterprise.

## 9. Posibles evoluciones futuras (muy breves)

- Clarificar responsabilidades mínimas por actor en incidencias comunes.
- Mejorar trazabilidad de decisiones operativas entre empresa y conductor.
- Estandarizar campos clave de comunicación sin cambiar el flujo base.
