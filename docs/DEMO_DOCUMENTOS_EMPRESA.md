# DEMO — Documentos empresa en servicio

**Solo entorno DEMO** (`VITE_APP_ENV=demo`). No aplicar la migración en producción.

## SQL (Supabase DEMO)

Ejecutar en el proyecto DEMO:

`supabase/migrations/20260531140000_servicio_documentos_empresa_demo.sql`

## UI

| Rol | Ubicación | Permisos |
|-----|-----------|----------|
| Empresa | Flota → expandir servicio → **DOCUMENTOS EMPRESA** | Subir, ver, descargar, eliminar |
| Conductor | Tab Servicio (cockpit activo) → debajo de documentos extra | Ver, descargar (sin eliminar ni subir) |

## Almacenamiento

- Tabla: `servicio_documentos_empresa` (independiente de `servicio_documentos_extra`)
- Storage: carpeta `documentos_empresa/{empresa_id}/{servicio_id}/` en bucket operativo (`user-photos`)

## Formatos

PDF, JPG, JPEG, PNG

## Checklist validación DEMO

1. **Subida PDF empresa** — cuenta empresa, servicio con `empresa_id`, subir PDF, aparece en lista con nombre y fecha.
2. **Visualización conductor** — cuenta conductor del mismo servicio, bloque DOCUMENTOS EMPRESA, botón Ver abre el PDF.
3. **Descarga conductor** — botón Descargar en conductor (sin Eliminar).
4. **Eliminación empresa** — solo empresa ve Eliminar; conductor no.
5. **Persistencia** — logout/login empresa y conductor: el documento sigue listado.

## No modifica

- Docs Lite / `servicio_documentos_extra` (conductor)
- Expediente operacional PDF
- Multi-conductor, FIFO, participación individual
