# Evidencias — Fase 1 (doc_meta v2)

Implementación mínima: **metadata de storage trazable** sin cambiar lectura UI/PDF ni esquema SQL.

## Qué cambia

| Área | Cambio |
|------|--------|
| `uploadBlobToStorage` | Devuelve `{ url, bucket, path, signedExpiresAt }` (antes solo `string` URL) |
| `uploadUserFile` | Devuelve el mismo objeto (docs extra usan paths) |
| `uploadUserPhoto` | Sigue devolviendo **string** URL (compat monolito `cuaderno-ruta.jsx`) |
| `buildDocMetaPayload` | `schema_version: 2` + `bucket`, `path_preview`, `path_original`, `signed_expires_at` |
| `evidencias.datos.doc_meta` | Escrituras nuevas vía `mergeDocMetaIntoDatos` |
| `servicio_documentos_extra.datos` | Incluye `doc_meta` v2 anidado (antes solo `uploaded_at` / `storage_ok`) |
| Trazas | `[MEDIA_V2]` en consola; con `docTrace=1` también en buffer `[DOC_TRACE]` |

Archivos nuevos:

- `src/domain/documents/mediaStorageV2.js` — helpers storage + trazas

## Qué NO cambia (compatibilidad)

- `evidencias.url` — se sigue escribiendo igual (`originalUrl \|\| previewUrl` en foto, `previewUrl` en CMR).
- `preview_url` / `original_url` en `doc_meta` — siguen rellenados (signed URLs).
- `resolveEvidenciaDisplayImageUrl` — **sin modificar**.
- Tablas SQL, UI, PDF, `cmr_docs`, bucket legacy `cmr`.
- Filas antiguas con `schema_version: 1` — se leen igual (`getDocMeta` no exige v2).

## Formato `doc_meta` v2

```json
{
  "schema_version": 2,
  "upload_pipeline": "foto_file_reader_jpeg",
  "display_name": "FOTO_…",
  "mime_type": "image/jpeg",
  "preview_url": "https://…/storage/v1/object/sign/user-photos/…",
  "original_url": "https://…/storage/v1/object/sign/user-photos/…/original/…",
  "bucket": "user-photos",
  "path_preview": "{uid}/stops/1716123456789.jpg",
  "path_original": "{uid}/stops/original/1716123456790.jpg",
  "signed_expires_at": "2026-05-26T12:00:00.000Z",
  "size_preview_bytes": 245000,
  "size_original_bytes": 3100000,
  "future_hooks": { … }
}
```

`signed_expires_at` = momento UTC estimado de caducidad del **signed URL de preview** (TTL 7 días, o 1 día si hubo reintento).

Si el upload cae a `data:` (sin objeto storage), `bucket` / `path_*` / `signed_expires_at` quedan `null` y `schema_version` sigue siendo 2 con URLs en `preview_url` como data URL.

## Ejemplo antes / después

### Antes (schema 1, foto reciente)

```json
{
  "doc_meta": {
    "schema_version": 1,
    "upload_pipeline": "foto_file_reader_jpeg",
    "preview_url": "https://xxx.supabase.co/storage/v1/object/sign/user-photos/uid/stops/123.jpg?token=…",
    "original_url": "https://xxx.supabase.co/storage/v1/object/sign/user-photos/uid/stops/original/124.jpg?token=…",
    "mime_type": "image/jpeg",
    "size_preview_bytes": 240000,
    "size_original_bytes": 2800000
  }
}
```

### Después (schema 2, misma subida)

```json
{
  "doc_meta": {
    "schema_version": 2,
    "upload_pipeline": "foto_file_reader_jpeg",
    "preview_url": "https://xxx.supabase.co/storage/v1/object/sign/user-photos/uid/stops/123.jpg?token=…",
    "original_url": "https://xxx.supabase.co/storage/v1/object/sign/user-photos/uid/stops/original/124.jpg?token=…",
    "bucket": "user-photos",
    "path_preview": "uid/stops/123.jpg",
    "path_original": "uid/stops/original/124.jpg",
    "signed_expires_at": "2026-05-26T10:15:00.000Z",
    "mime_type": "image/jpeg",
    "size_preview_bytes": 240000,
    "size_original_bytes": 2800000
  }
}
```

### `servicio_documentos_extra.datos` después

```json
{
  "schema_version": 1,
  "uploaded_at": "2026-05-19T10:00:00.000Z",
  "storage_ok": true,
  "doc_meta": {
    "schema_version": 2,
    "upload_pipeline": "extra_jpeg_v1",
    "preview_url": "https://…",
    "bucket": "user-photos",
    "path_preview": "uid/servicio_extra/1716123456789.jpg",
    "path_original": null,
    "signed_expires_at": "2026-05-26T10:00:00.000Z"
  }
}
```

## Trazas `[MEDIA_V2]`

Activación:

- Siempre: `console.log("[MEDIA_V2]", …)` en upload OK y al persistir `doc_meta` v2.
- Extra: `localStorage.docTrace=1` o `?docTrace=1` → entradas también en buffer `[DOC_TRACE]`.

Ejemplo consola tras subir foto:

```
[MEDIA_V2] upload_complete { bucket: "user-photos", path_preview: "uuid/stops/1716….jpg", … }
[MEDIA_V2] doc_meta_persisted { schema_version: 2, bucket: "user-photos", path_preview: "…", … }
```

## Rollback

1. Revertir commit de Fase 1 (sin migración DB: solo JSON nuevos en filas nuevas).
2. Filas ya guardadas con v2 **siguen siendo legibles** (campos extra ignorados por código actual).
3. No hace falta borrar datos: `resolveEvidenciaDisplayImageUrl` no usa paths todavía.

Riesgo bajo: si se revierte solo el código, las nuevas subidas volverían a schema 1 hasta redeploy.

## Verificación manual

1. `localStorage.docTrace = "1"` → recargar.
2. Subir **foto** en parada → Network: POST storage + sign; consola `[MEDIA_V2]`.
3. Inspeccionar fila `evidencias` en Supabase: `datos.doc_meta.schema_version === 2` y paths poblados.
4. Subir **documento extra** → `servicio_documentos_extra.datos.doc_meta` con mismos campos.
5. Abrir expediente / thumb / PDF → debe comportarse **igual** que antes (mismas URLs).

## Siguiente fase (fuera de alcance)

- Re-sign en lectura usando `bucket` + `path_preview` / `path_original`.
- Dejar de persistir signed URLs largas en DB.
- Unificar `evidencias.url` = siempre preview path-backed.

Ver `docs/EVIDENCIAS_CANONICAL_MODEL.md`.
