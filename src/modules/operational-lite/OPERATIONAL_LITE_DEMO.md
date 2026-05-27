# Documento Operacional Lite — notas demo comercial

## Acceso (Autónomo PRO)

Requisito: `profiles.tipo_cuenta = autonomo_pro` y sesión con feature `can_view_operational_lite` (shell conductor; tras login o `bootstrapAuthSession`).

1. **Servicio con expediente cerrado** (`cerrado` o meta `expediente_cierre`) → pestaña **Servicio**: `OperationalSummaryLite` con PDF e impresión.
2. **Documentos → Por servicio** → servicio **completado** o **cerrado** → botón **Documento operacional** (modal).

Si no ves el módulo: cierra sesión y vuelve a entrar (rehidrata capabilities) o despliega la rama `develop` en demo.

## Qué demostrar al cliente

- Cabecera con referencia, ruta, estado y sello **COMPLETADO** si el viaje está cerrado.
- Timeline por paradas (llegada/salida, muelle, incidencias, nº documentos).
- Galería táctil de evidencias (CMR, fotos, POD, incidencias).
- Cierre con firma y resumen ejecutivo (cargas, descargas, fotos, CMR…).
- **PDF** multipágina: resumen + timeline + anexo visual por parada + cierre.

## Checklist QA rápido

- [ ] Servicio con 2+ paradas y fotos en carga y descarga
- [ ] Al menos un CMR escaneado
- [ ] Incidencia con foto adjunta
- [ ] Cierre documental con firma
- [ ] PDF con muchas imágenes (paginación)
- [ ] Vista en móvil vertical y tablet
- [ ] Imprimir desde Safari/Chrome tablet

## No incluye (por diseño)

- Tacógrafo, conducción, descanso, Reg. 561/2006
- Informe enterprise de flota

## Deploy

Solo rama `develop` / entorno demo (Vercel preview). No desplegar a producción hasta validación comercial.
