# Rollback controlado — RAW_PHOTO_MODE

**Fecha:** mayo 2026  
**Motivo:** tras `foto_raw_v1`, el PDF dejó de mostrar fotos en anexo A4; el bug B/N en visor no mejoró.  
**Alcance del rollback:** solo pipeline de subida/render de fotos operativas. **No** toca env hardening, demo/real, `doc_meta` v2, RLS ni SQL.

> El repo no tiene historial git local. La lista siguiente es por **archivo + bloque lógico** (equivalente a un commit atómico `revert: RAW_PHOTO_MODE`).

---

## 1. Cambios implicados (última iteración inestable)

| # | Archivo | Qué introdujo RAW | Impacto observado |
|---|---------|-------------------|-------------------|
| R1 | `src/data/uploadOperationalDocument.js` | Rama `isFotoTipo` → subida del `File` sin comprimir; `upload_pipeline: "foto_raw_v1"`; `mime` nativo (HEIC/WebP); sin `path_original` separado | PDF: `fetchEvidenceImages` → `blobToJpeg` falla o no decodifica HEIC; anexo A4 vacío |
| R2 | `src/features/documents/OperationalEvidenciasStop.jsx` | `url = previewUrl` (antes `originalUrl \|\| previewUrl`); trazas `[RAW_PHOTO_MODE]` | `evidencias.url` sin original JPEG; visor/PDF peor alineados |
| R3 | `src/domain/documents/mediaStorageV2.js` | `traceRawPhotoMode()` | Solo diagnóstico |
| R4 | `src/data/uploadUserPhoto.js` | `extFromMime` ampliado (HEIC/WebP desde nombre) | Menor; **se mantiene** (ayuda storage; no rompe PDF) |

### No forman parte de este rollback (estables, conservar)

| Área | Archivos |
|------|----------|
| Metadata v2 | `mediaStorageV2.js` (`StorageUploadResult`, `[MEDIA_V2]`), `buildDocMetaPayload`, `serviceExtraDocuments.js` |
| PDF / resolve | `serviceExpediente.js`, `operationalDocumentRecord.js` (`resolveEvidenciaDisplayImageUrl` **sin cambios**) |
| Env / Supabase | `src/config/env.js`, migraciones, scripts demo |
| CMR | `processOperationalDocumentImage` + `document_canvas` |

### Estado objetivo tras rollback (último estable conocido)

- Foto parada: `compressImageToJpegBlob(file, 1600, 0.82)` → preview JPEG en `stops/`
- Si `file.size > 100 KB`: original en `stops/original/`
- `upload_pipeline: "foto_file_reader_jpeg"`
- `evidencias.url` = `originalUrl || previewUrl`
- Preview UI local: `createObjectURL(file)` (`forFoto: true`) — sin subir raw
- B/N en visor: **puede persistir** (no es objetivo de este rollback)

### Por qué RAW rompió el PDF (hipótesis confirmada en código)

```text
makePdfBlob → fetchEvidenceImages → fetch(url) → blobToJpeg (canvas + JPEG)
```

El anexo A4 (`annexDocs`) necesita bytes **JPEG decodificables** en el navegador. Con `foto_raw_v1`, el objeto en Storage puede ser HEIC/WebP; `Image`/`blobToJpeg` falla → `imageMap` sin bytes → hoja anexo sin imagen.

---

## 2. Rollback mínimo seguro (aplicado)

1. **`uploadOperationalDocument.js`** — restaurar rama `processImage && isFotoTipo` con `compressImageToJpegBlob(1600, 0.82)` + original opcional; eliminar `foto_raw_v1` y `extensionFromFile` en meta de foto.
2. **`OperationalEvidenciasStop.jsx`** — `const url = originalUrl || previewUrl`; quitar import/uso de `traceRawPhotoMode`.
3. **`mediaStorageV2.js`** — eliminar `traceRawPhotoMode`.
4. **No revertir** `uploadUserPhoto.extFromMime`, env, v2, `resolveEvidenciaDisplayImageUrl`, `serviceExpediente.js`.

Fotos ya guardadas con `upload_pipeline: "foto_raw_v1"` no se migran automáticamente; el PDF puede seguir fallando en esas filas hasta re-subir o regenerar signed URL contra un JPEG.

---

## 3. Checklist validación PDF / evidencias

### Pre-requisitos

- [ ] Build desplegado (`npm run build` OK)
- [ ] Usuario conductor con servicio activo y parada con permiso de evidencias
- [ ] (Opcional) `localStorage.setItem('docTrace','1')` para trazas

### Subida foto nueva (post-rollback)

- [ ] Consola: `uploadOperationalDocument:branch_foto_file_reader_jpeg` (no `foto_raw_v1` ni `[RAW_PHOTO_MODE]`)
- [ ] `doc_meta.upload_pipeline` = `foto_file_reader_jpeg`
- [ ] `doc_meta.mime_type` = `image/jpeg` (preview)
- [ ] Si foto > 100 KB: `original_url` distinto de `preview_url` y `path_original` poblado
- [ ] `evidencias.url` = URL del **original** si existe, si no preview

### UI evidencias

- [ ] Miniatura en parada / expediente carga (signed URL)
- [ ] Visor documental abre imagen (puede seguir B/N — anotar aparte)
- [ ] Timeline: texto «reproduccion A4 en anexo final» en evento foto

### PDF expediente

- [ ] Generar PDF del servicio con al menos 1 foto nueva
- [ ] Cuerpo: foto **no** incrustada inline (solo referencia anexo)
- [ ] **Anexo final:** una hoja A4 por foto con imagen visible y título
- [ ] CMR en anexo sigue funcionando
- [ ] Sin mensaje «Documento no disponible» en anexo (salvo URL caducada)

### Regresión CMR / extras

- [ ] Escanear CMR: `upload_pipeline: document_canvas`
- [ ] Doc extra (foto adicional): sigue por `uploadUserFile` / `servicio_extra`

### Qué NO validar en este rollback

- Color B/N en visor móvil (bug abierto; requiere otro experimento)
- Filas antiguas solo `foto_raw_v1` en Storage (re-subir foto de prueba)

---

## Referencia rápida de pipelines

| `upload_pipeline` | Uso |
|-------------------|-----|
| `foto_file_reader_jpeg` | **Estable** — foto parada |
| `foto_raw_v1` | **Revertido** — raw cámara |
| `document_canvas` | CMR / escaneo |
| `pdf_raw` | PDF operativo |
| `legacy_upload_user_file` | Fallback sin `processImage` |
