# Modelo canónico de evidencias y uploads — auditoría y propuesta

**Alcance:** solo lectura del código (mayo 2026). **Sin implementación.**  
**Objetivo:** unificar fotos/documentos operativos con un modelo migrable, no una reescritura idealista.

---

## 1. Inventario real de campos usados

### 1.1 Tabla `public.evidencias` (Postgres)

| Campo | Uso real | Notas |
|-------|----------|--------|
| `id` | PK | — |
| `stop_id` | FK parada | Obligatorio en UI operativa |
| `tipo` | `foto`, `cmr`, `incidencia`, `nota` | Incidencia/nota **sin archivo** |
| `url` | **URL “principal” legacy + híbrida** | Signed URL, a veces `data:`, a veces original |
| `datos` | JSON libre | CMR OCR + **`doc_meta`** |
| `nota` | Texto libre | Incidencias |
| `created_at` | Orden / expediente | — |

**No existen columnas** `original_url`, `preview_url`, `mime_type`, `bucket`, `storage_path` en SQL.

### 1.2 `evidencias.datos` (JSON)

| Rama | Campos | Origen |
|------|--------|--------|
| **CMR OCR** | `num_cmr`, `remitente`, `destinatario`, … | `/api/cmr` (Claude Vision) |
| **Incidencia / nota** | `texto` | Solo formulario, sin upload |
| **`doc_meta`** | Ver tabla siguiente | `buildDocMetaPayload` → `mergeDocMetaIntoDatos` |

### 1.3 `datos.doc_meta` (schema_version = 1)

| Campo | Escrito en upload | Leído en UI/PDF |
|-------|-------------------|-----------------|
| `schema_version` | ✓ | Implícito |
| `upload_pipeline` | ✓ | Trace / debug |
| `display_name`, `archivo_nombre` | ✓ | Títulos expediente |
| `mime_type` | ✓ | Etiqueta tipo |
| `size_bytes`, `size_preview_bytes`, `size_original_bytes` | ✓ | Tamaño expediente |
| `width`, `height` | ✓ (canvas) | — |
| **`preview_url`** | ✓ signed HTTP | `enrichEvidenciaDisplay`, PDF |
| **`original_url`** | ✓ opcional | **`resolveEvidenciaDisplayImageUrl`** (prioridad) |
| `stop_id`, `servicio_id`, `conductor_id` | ✓ | Contexto |
| `tipo_documento`, `cliente`, `ciudad`, `evento_operacional` | ✓ | Copy UI |
| `geo` | ✓ | Operativa |
| `created_at` | ✓ | — |
| `future_hooks` | Placeholder | — |

**No se persiste hoy:** `bucket`, `storage_path`, `object_id`, `signed_expires_at`, hash del blob.

### 1.4 Tabla `public.servicio_documentos_extra` (expediente, no parada)

| Campo | Uso |
|-------|-----|
| `archivo_url` | Canónico producción |
| `url` | Legacy (sync bidireccional en migración SQL) |
| `mime_type`, `size_bytes`, `archivo_nombre` | Metadatos |
| `conductor_id` / `creado_por` | Dual legacy |
| `datos` | `{ schema_version, uploaded_at, storage_ok }` — **no** `doc_meta` completo |

### 1.5 Tabla legacy `public.cmr_docs` (monolito)

| Campo | Uso |
|-------|-----|
| `foto_url` | Signed URL tras subida directa a bucket **`cmr`** |
| Campos CMR | Mismo JSON que evidencias |

Flujo **paralelo** al de `evidencias` (pantalla escáner CMR en `cuaderno-ruta.jsx`, no `OperationalEvidenciasStop`).

### 1.6 URLs en runtime (no siempre en DB)

| Mecanismo | Dónde | Propósito |
|-----------|--------|-----------|
| **`URL.createObjectURL`** | Preview modal CMR/foto antes de guardar | UI local, revocado al cerrar |
| **Signed URL** (`/storage/v1/object/sign/…`) | Tras `uploadBlobToStorage` | Valor guardado en `url` / `doc_meta` |
| **`data:` base64** | Fallback si falla sign (solo si `allowBase64Fallback`) | Extra docs **rechazan** esto (`requireHttpUrl`) |
| **Fetch directo** | PDF `fetchEvidenceImages`, thumbs | `GET` a signed URL almacenada |

---

## 2. Rutas de upload activas

```
                    ┌─────────────────────────────────────────┐
                    │         uploadOperationalDocument        │
                    └─────────────────────────────────────────┘
                      │ PDF          │ foto+processImage
                      │              │ CMR/incidencia doc
                      ▼              ▼                    ▼
              uploadUserFile    compressImageToJpegBlob   processOperationalDocumentImage
              (raw PDF)         + uploadBlobToStorage     (canvas crop docMode)
                      │              │                    │
                      └──────────────┴────────────────────┘
                                     │
                            uploadBlobToStorage  ←── uploadUserPhoto / uploadUserFile
                                     │
                            bucket: user-photos ONLY
                            path: {uid}/{folder}/{ts}.{ext}
                            sign: 7d (fallback 1d)
```

| Ruta | Activa | Entrada | Procesado | Destino storage | Salida DB |
|------|--------|---------|-----------|-----------------|-----------|
| **A. Foto parada** | ✓ | `OperationalEvidenciasStop.onFotoSelected` | `compressImageToJpegBlob` 1600px Q0.82 | `user-photos/{uid}/stops/…` + opcional `stops/original/…` | `evidencias.url` = **original \|\| preview**; `doc_meta` ambas URLs |
| **B. CMR parada** | ✓ | `guardarCmr` | `processOperationalDocumentImage(documentMode:true)` | `user-photos/{uid}/cmr/…` | `evidencias.url` = **solo preview**; OCR en `datos` |
| **C. PDF operativo** | ✓ | `uploadOperationalDocument` isPdf | Raw | `user-photos/…/stops/…pdf` | `url` + `doc_meta` |
| **D. Legacy `processImage` false** | ⚠️ código | `uploadOperationalDocument` else | `uploadUserFile` 800px | `user-photos` | Igual estructura meta si se llamara |
| **E. Docs extra servicio** | ✓ | `uploadServicioDocumentoExtra` | `uploadUserFile` 800px, `requireHttpUrl` | `user-photos/{uid}/servicio_extra/…` | `archivo_url` (+ `url` legacy) |
| **F. Escáner CMR monolito** | ✓ legacy | `cuaderno-ruta` CMR UI | Raw bytes POST | bucket **`cmr`** `{uid}/…` | tabla **`cmr_docs`**, no evidencias |
| **G. Incidencia / nota** | ✓ | `guardarEvidencia` | Sin archivo | — | Solo `datos.texto`, `url` null |

**Canvas / pipelines:**

| Pipeline | Tecnología | Usado para |
|----------|------------|------------|
| `compressImageToJpegBlob` | FileReader → canvas → JPEG | **Foto parada** (moderno), docs extra |
| `processOperationalDocumentImage` | createObjectURL → canvas → crop bounds → JPEG | **CMR parada**, preview modal |
| Raw upload | `fetch` POST blob sin reencode | PDF, fallback legacy |

**Previews (solo UI, no persistidos):**

- Foto: `createObjectURL(file)` antes de subir (no es el blob subido).
- CMR: `createObjectURL(previewBlob)` tras canvas.

**Signed URLs:**

- Generadas en cliente tras upload (`uploadBlobToStorage`).
- TTL 7 días (`SIGNED_URL_TTL_SEC`).
- Se **guardan como string completo** en DB → caducan sin re-firma al leer.

---

## 3. Quién usa qué URL

| Consumidor | Orden de preferencia | Notas |
|------------|---------------------|--------|
| **`resolveEvidenciaDisplayImageUrl`** | `doc_meta.original_url` → `doc_meta.preview_url` → `evidencias.url` | **Canónico color** para visor/PDF |
| **`enrichEvidenciaDisplay`** | `displayImageUrl` = resolve…; `previewUrl` = meta.preview \|\| **url columna** | `previewUrl` puede ≠ preview real si `url` guardó original |
| **`OperationalDocumentRow` / thumbs** | `displayImageUrl` \|\| original \|\| preview \|\| url | Redundante con enrich |
| **`evidenceUrlForPdfEmbed`** | = `resolveEvidenciaDisplayImageUrl` | PDF anexo |
| **`fetchEvidenceImages`** | fetch URL → blob → re-JPEG canvas | Segunda compresión en PDF |
| **`onOpen` evidencia** | `row.url` en algunos sitios | Puede ignorar `displayImageUrl` |
| **Foto persist** | `url` columna = `originalUrl \|\| previewUrl` | Contradice CMR (solo preview en columna) |
| **CMR persist** | `url` columna = `previewUrl` only | `original_url` en meta si >100KB |

**`objectURL`:** solo previews locales y utilidades PDF (`blobToImage`); **nunca** se persiste en Supabase.

**Storage direct URL:** upload usa `POST …/object/{bucket}/{path}`; lectura vía signed URL o fetch a URL guardada (no path-based resolver en app).

---

## 4. Buckets y rutas reales

### 4.1 Buckets en Supabase (migraciones RLS)

| Bucket | RLS en repo | Upload real desde app |
|--------|-------------|------------------------|
| **`user-photos`** | ✓ `stor_uph_*` | **Todos** los uploads modernos (`uploadBlobToStorage`) |
| **`cmr`** | ✓ `stor_cmr_*` | Solo escáner legacy monolito (`cuaderno-ruta`) |

### 4.2 Buckets “lógicos” (solo código, **no** Storage)

En `serviceExpediente.bucketForEvidence` / `extraDocumentExpediente`:

`fotos`, `incidencias`, `documentos`, `cmr` — etiquetas de expediente/PDF, **no** rutas ni buckets reales.

### 4.3 Convención de path (física en `user-photos`)

```
{auth.uid()}/{folder}/{timestamp}.{ext}
{auth.uid()}/{folder}/original/{timestamp}.{ext}   ← original opcional
```

| `folder` (parámetro) | Flujo |
|----------------------|--------|
| `stops` | Foto/PDF parada |
| `stops/original` | Original foto (si >100 KB) |
| `cmr` | CMR `OperationalEvidenciasStop` |
| `cmr/original` | Original CMR procesado |
| `servicio_extra` | Documentos extra del viaje |
| `misc` | Default `uploadUserPhoto` |

**Contradicción:** CMR operativo va a **`user-photos/.../cmr/`**, no al bucket `cmr`. El bucket `cmr` queda para legacy + políticas RLS huérfanas respecto al upload moderno.

---

## 5. Duplicidades y contradicciones

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **Dos sistemas CMR** (`evidencias` vs `cmr_docs` + bucket `cmr`) | Datos partidos, RLS distinta |
| 2 | **`evidencias.url` semántica inconsistente** (foto: a menudo original; CMR: preview) | Confusión si se lee `url` sin `doc_meta` |
| 3 | **`previewUrl` en enrich** usa `evidencias.url` como fallback | Mezcla preview y original en UI secundaria |
| 4 | **Signed URL en DB sin expiry metadata** | Enlaces rotos a los 7 días; PDF histórico falla |
| 5 | **Fallback `data:`** en upload operativo (si sign falla) | Filas con URL no HTTP; extra docs lo bloquean, evidencias no |
| 6 | **Bucket lógico ≠ bucket físico** (`fotos` vs `user-photos`) | Auditoría storage imposible por metadatos |
| 7 | **Dos pipelines imagen** (FileReader vs objectURL) para color/BN | Histórico bug foto B/N; mitigado en rama foto pero CMR sigue canvas+objectURL |
| 8 | **`servicio_documentos_extra` sin `doc_meta`** | Mismo producto, contrato distinto a evidencias |
| 9 | **Sin `storage_path` persistido** | No se puede re-firmar sin parsear URL |
| 10 | **PDF re-comprime** todo fetch | Pérdida calidad + dependencia URL viva |
| 11 | **Incidencia sin adjunto** | OK por diseño; bucket `incidencias` solo es etiqueta |

---

## 6. Modelo canónico propuesto (migrable)

Principios: **un contrato**, **original inmutable en storage**, **preview derivado opcional**, **metadatos obligatorios mínimos**, **re-firma al leer**, **compat legacy por lectura**.

### 6.1 Entidad lógica: `OperationalMedia` (evidencias + extra unificados a largo plazo)

Fase 1–2 solo **normalizar evidencias**; extra docs adoptan el mismo `doc_meta` ampliado.

```ts
// Contrato lógico (no es DDL todavía)
OperationalMedia {
  id: uuid
  scope: "stop" | "service"      // stop → evidencias; service → servicio_documentos_extra
  scope_id: uuid
  tipo: "foto" | "cmr" | "pdf" | "incidencia" | "nota" | ...
  nota?: string
  payload?: object               // CMR OCR, incidencia.texto, etc.

  storage: {
    bucket: "user-photos"        // único bucket operativo (fase migración)
    path_preview: string         // obligatorio si hay binario
    path_original?: string       // obligatorio si se conserva original
    mime: string
    size_preview: number
    size_original?: number
  }

  doc_meta: {                    // siempre presente si hay storage
    schema_version: 2
    upload_pipeline: string      // enum estable
    display_name: string
    width?, height?
    // URLs derivadas — NO fuente de verdad
    preview_url?: string         // cache; regenerable
    original_url?: string
    signed_expires_at?: string   // ISO
  }
}
```

### 6.2 Reglas de escritura (upload)

1. **Siempre** subir a `user-photos` con path canónico:
   - `{uid}/operational/{servicio_id|_}/{stop_id|_}/{tipo}/{media_id}/preview.jpg`
   - `{uid}/operational/.../original.{ext}` si aplica
2. **Original:** archivo fuente sin crop destructivo para `foto`; para `cmr` guardar original **y** preview procesado.
3. **Preview:** JPEG derivado (compresión única estándar: `compressImageToJpegBlob` para fotos; canvas crop solo CMR).
4. **Tras upload:** guardar `bucket` + `path_*` en `doc_meta`; generar signed URL corta (ej. 1 h) solo para respuesta inmediata UI.
5. **`evidencias.url` (legacy):** escribir **siempre** `preview` signed URL o dejar de escribir y usar solo meta (fase 2); lectura sigue con resolve.

### 6.3 Reglas de lectura (UI, PDF, thumbs)

```
displayUrl(media) =
  resign(path_original) ?? resign(path_preview) ??
  doc_meta.original_url ?? doc_meta.preview_url ?? evidencias.url
```

- Función única `resolveOperationalMediaUrl(ev)` — ya existe como `resolveEvidenciaDisplayImageUrl`; extender con re-sign.
- **Prohibido** abrir `ev.url` directo en UI sin pasar por resolve (auditar `onOpen`).

### 6.4 `upload_pipeline` (enum documentado)

| Valor | Significado |
|-------|-------------|
| `foto_jpeg_v1` | FileReader canvas 1600px (actual foto) |
| `cmr_document_v1` | Canvas crop + JPEG |
| `pdf_raw_v1` | PDF sin transformar |
| `extra_jpeg_v1` | Docs extra (800px) |
| `legacy_cmr_bucket` | Monolito → bucket `cmr` |

### 6.5 Compatibilidad legacy

| Legacy | Lectura | Migración |
|--------|---------|-----------|
| Solo `evidencias.url` | Tratar como `preview_url` si no hay meta | Backfill `doc_meta` mínimo |
| `data:` en url | Mostrar; marcar `storage_ok: false` | Re-subida manual |
| `cmr_docs` + bucket `cmr` | Mantener lectura; no crear nuevos | Script copia a evidencias o deprecar UI |
| `servicio_documentos_extra.url` | = `archivo_url` | Añadir `doc_meta` v2 en `datos` |
| Signed URL expirada | Re-sign si hay path; si no, placeholder | Job opcional parse URL → path |

### 6.6 PDF

- Usar `resolveOperationalMediaUrl` + fetch; si falla, placeholder en anexo.
- Opcional fase 2: incrustar bytes en Storage temporal o cache IndexedDB por servicio (fuera de alcance inicial).

---

## 7. Plan de migración sugerido (sin implementar)

| Fase | Acción | Riesgo |
|------|--------|--------|
| **0** | Documentar enum pipelines + tests golden en 3 tipos (foto, CMR, extra) | Bajo |
| **1** | Añadir a `doc_meta` v2: `bucket`, `path_preview`, `path_original`, `signed_expires_at` (escritura dual) | Bajo |
| **2** | `resolveUrl` con re-sign desde path; unificar `onOpen` / thumbs | Medio |
| **3** | Alinear CMR: `evidencias.url` = preview; columna siempre preview; original solo path/meta | Medio |
| **4** | Deprecar escáner `cmr_docs` / uploads a bucket `cmr` | Alto (usuarios legacy) |
| **5** | Unificar `servicio_documentos_extra.datos.doc_meta` con mismo shape | Medio |
| **6** | Dejar de persistir signed URL larga (solo paths) | Alto (requiere re-sign en toda lectura) |

---

## 8. Resumen ejecutivo

- **Hoy** el sistema funcional gira en `uploadOperationalDocument` + `uploadBlobToStorage` → bucket **`user-photos`**, con metadatos ricos en **`evidencias.datos.doc_meta`** (`preview_url`, `original_url`) y columna **`url`** de significado variable.
- **Legacy activo:** escáner CMR en monolito → bucket **`cmr`** + tabla **`cmr_docs`**; docs extra con **`archivo_url`** sin `doc_meta` completo.
- **Riesgo principal:** URLs firmadas caducadas guardadas como verdad; buckets lógicos (`fotos`, `incidencias`) que no existen en Storage.
- **Propuesta:** paths + bucket en meta, original inmutable, preview derivado, re-sign al leer, `evidencias.url` como alias legacy de preview hasta fase 6.

---

*Auditoría basada en: `uploadOperationalDocument.js`, `uploadUserPhoto.js`, `operationalDocumentRecord.js`, `operationalDocumentPipeline.js`, `OperationalEvidenciasStop.jsx`, `serviceExtraDocuments.js`, `serviceExpediente.js`, `cuaderno-ruta.jsx` (CMR legacy), migraciones Storage RLS.*
