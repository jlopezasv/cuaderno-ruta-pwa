MAPA OPERATIVO COMPLETO Y VARIABLES — SaaS DE TRANSPORTE
Documento completo de arquitectura operativa, lógica de negocio, participantes, variables y flujo real del SaaS de coordinación logística.
1. VISIÓN DEL SISTEMA
•	Sistema operativo de coordinación logística.
•	Pensado para empresas pequeñas y medianas de transporte.
•	Orientado a operativa real y tiempo real.
•	Simple para conductores.
•	Potente para tráfico.
•	Escalable para crecer.
2. OBJETIVO DEL SaaS
•	Centralizar toda la operativa del transporte.
•	Coordinar servicios, conductores y recursos.
•	Controlar disponibilidad legal.
•	Calcular ETA real operativo.
•	Registrar evidencias y eventos.
3. EMPRESA DE TRANSPORTE
•	La empresa domina toda la operación.
•	Crea servicios.
•	Asigna participantes.
•	Controla incidencias.
•	Visualiza ETAs.
•	Visualiza disponibilidad.
4. ROLES DEL SISTEMA
•	Administrador
•	Tráfico
•	Administración
•	Comercial
•	Conductor principal
•	Segundo conductor
•	Cargador
•	Subcontrata
5. ESTRUCTURA CENTRAL
•	Servicio
•	→ Paradas
•	→ Participantes
•	→ Operaciones
•	→ Eventos
•	→ Evidencias
•	→ ETA
•	→ Timeline
6. VARIABLES DEL SERVICIO
•	Referencia
•	Cliente
•	Origen
•	Destino
•	Estado
•	Tipo servicio
•	Fecha salida
•	ETA final
•	Tiempo estimado
•	Distancia
•	Prioridad
•	Observaciones
7. ESTADOS DEL SERVICIO
•	Pendiente
•	Asignado
•	En preparación
•	En carga
•	En tránsito
•	En pausa
•	En incidencia
•	Entregado
•	Completado
•	Cancelado
8. VARIABLES DE PARADAS
•	Tipo parada
•	Orden
•	Empresa
•	Ubicación
•	Dirección
•	ETA
•	Llegada real
•	Salida real
•	Tiempo espera
•	Tiempo operación
•	Estado parada
•	Notas
9. TIPOS DE PARADA
•	Carga
•	Descarga
•	Relevo
•	Descanso
•	Espera
•	Transbordo
•	Repostaje
•	Control
10. VARIABLES DEL CONDUCTOR
•	Nombre
•	Estado operativo
•	Tarjeta activa
•	Conducción diaria
•	Conducción semanal
•	Conducción bisemanal
•	Conducción continua
•	Tiempo restante
•	Próxima pausa
•	Próximo descanso
•	Disponibilidad legal
•	Ubicación actual
11. ESTADOS DEL CONDUCTOR
•	Disponible
•	Conduciendo
•	Pausa
•	Descanso
•	Esperando
•	En carga
•	Fuera jornada
•	No disponible
12. CONDUCTOR ACTIVO
•	El servicio debe saber siempre qué conductor está activo.
•	El ETA depende del conductor activo.
•	El sistema debe usar el estado del tacógrafo para calcular el viaje.
13. DOBLE CONDUCTOR
•	El sistema debe soportar dos conductores.
•	Debe calcular conducción compartida.
•	Debe calcular descansos alternados.
•	Debe recalcular ETA automáticamente.
14. VARIABLES DE ETA
•	Distancia restante
•	Tiempo restante
•	Pausas legales
•	Descanso diario
•	Tráfico
•	Esperas
•	Incidencias
•	Conductor activo
•	Modo doble conductor
15. PLAN OPERATIVO
•	Conducción por días.
•	Kilómetros por día.
•	Horas disponibles.
•	Puntos de descanso.
•	Paradas planificadas.
•	ETA diario.
16. VARIABLES DE MERCANCÍA
•	Palets
•	Peso
•	Bultos
•	Temperatura
•	ADR
•	Lotes
•	Tipo mercancía
•	Mercancía parcial
17. MÚLTIPLES CARGAS Y DESCARGAS
•	El sistema debe soportar grupaje.
•	Múltiples cargas.
•	Múltiples entregas.
•	Mercancía parcial por parada.
18. VARIABLES DE DOCUMENTOS
•	CMR
•	POD
•	Albarán
•	Fotos
•	Firma
•	Certificados
•	Documentos descarga
19. VARIABLES DE INCIDENCIAS
•	Tipo incidencia
•	Gravedad
•	Descripción
•	Ubicación
•	Fotos
•	Responsable
•	Hora
•	Resolución
20. TIPOS DE INCIDENCIA
•	Retraso
•	Temperatura
•	Daño mercancía
•	Avería
•	Tráfico
•	Documentación
•	Rechazo
•	Relevo
•	Transbordo
21. EVENTOS DEL SISTEMA
•	Servicio iniciado
•	Llegada parada
•	Inicio carga
•	Fin carga
•	Salida
•	Pausa iniciada
•	Descanso iniciado
•	Documento subido
•	Incidencia creada
•	Entrega completada
22. TIMELINE OPERATIVO
•	Toda operación genera eventos cronológicos.
•	Todo queda auditado.
•	Toda evidencia queda asociada al evento.
23. PANEL DE TRÁFICO
•	Servicios activos
•	Conductores disponibles
•	ETA operativo
•	Riesgos legales
•	Incidencias
•	Mapa operativo
•	Paradas activas
•	Tiempo restante
24. PANEL COMERCIAL
•	Estado cliente
•	ETA cliente
•	Retrasos
•	Cumplimiento
•	Entregas
25. PANEL ADMINISTRACIÓN
•	CMRs
•	Documentación
•	Incidencias
•	Servicios cerrados
•	Validaciones
26. PANEL CONDUCTOR
•	Servicio activo
•	Siguiente parada
•	Tiempo restante
•	Descansos
•	Documentos
•	Incidencias
•	Plan por días
27. PRINCIPIOS DE UX
•	Simple.
•	Visual.
•	Botones grandes.
•	Una acción principal.
•	Pocos clics.
•	Operativa rápida.
28. DIFERENCIADOR
•	No es un simple gestor de viajes.
•	El núcleo es la disponibilidad operativa legal.
•	El núcleo es el ETA real.
•	El núcleo es la coordinación en tiempo real.
29. VISIÓN FINAL
•	Crear el sistema operativo de ejecución logística para empresas de transporte.
•	Especializado en operativa real.
•	Preparado para internacional y frío.
•	Escalable hasta grandes flotas.
“Todo lo que ocurre en una operación logística es un evento ejecutado por personas sobre recursos dentro de un servicio.”
