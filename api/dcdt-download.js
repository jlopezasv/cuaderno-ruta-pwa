// api/dcdt-download.js — Descarga pública directa DeCA (PDF binario, sin auth)
import { getSupabaseServiceRoleKey, getSupabaseServerEnv } from "./_lib/supabaseEnv.js";

const DCDT_TABLES = ["dcdt_servicio", "carta_porte_servicio"];
const ESTADOS_DESCARGA = new Set(["validado", "incluido_en_expediente"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function srHeaders() {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function srJsonHeaders() {
  return {
    ...srHeaders(),
    "Content-Type": "application/json",
  };
}

function encodeStorageObjectPath(objectPath) {
  return String(objectPath || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function notFound(res) {
  return res.status(404).end();
}

function resolvePdfFilename(datos, decaPublicId) {
  const snapRef = datos?.validacion_snapshot?.referencia;
  const archivo = String(datos?.pdf_archivo_nombre || "").trim();
  const fromArchivo = archivo.replace(/^dcdt-/i, "").replace(/\.pdf$/i, "");
  const raw = String(snapRef || fromArchivo || decaPublicId || "documento").trim();
  const safe = raw.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]+/gi, "_").replace(/_+/g, "_").slice(0, 80);
  return `DeCA-${safe || "documento"}.pdf`;
}

async function fetchDcdtByDecaPublicId(decaPublicId) {
  const { url } = getSupabaseServerEnv();
  const enc = encodeURIComponent(decaPublicId);
  const select = "id,servicio_id,estado,datos,validado_at";
  for (const table of DCDT_TABLES) {
    for (const filter of [`deca_public_id=eq.${enc}`, `datos->>deca_public_id=eq.${enc}`]) {
      const apiPath = `${url}/rest/v1/${table}?${filter}&select=${select}&limit=1`;
      const r = await fetch(apiPath, { headers: srJsonHeaders() });
      if (!r.ok) continue;
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0]) return rows[0];
    }
  }
  return null;
}

async function fetchRestRows(path) {
  const { url } = getSupabaseServerEnv();
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: srJsonHeaders() });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) ? rows : null;
}

function storageFromExtraDatos(extraDatos) {
  if (!extraDatos || typeof extraDatos !== "object") return null;
  const path = String(extraDatos.path || extraDatos.pdf_storage_path || "").trim();
  const bucket = String(extraDatos.bucket || extraDatos.pdf_storage_bucket || "").trim();
  if (!path || !bucket) return null;
  return {
    bucket,
    path,
    sizeBytes: extraDatos.pdf_size_bytes ?? null,
    pdfHasQr: extraDatos.pdf_has_qr === true,
  };
}

/** Fuente canónica del PDF servido: documento extra (más reciente) → datos DCDT. */
async function resolvePdfStorageLocation(row) {
  const datos = row.datos && typeof row.datos === "object" ? row.datos : {};
  const extraId = datos.pdf_documento_extra_id;

  if (extraId) {
    const extraRows = await fetchRestRows(
      `servicio_documentos_extra?id=eq.${encodeURIComponent(extraId)}&select=datos,size_bytes&limit=1`,
    );
    const hit = storageFromExtraDatos(extraRows?.[0]?.datos);
    if (hit) return hit;
  }

  if (row.servicio_id) {
    const latestRows = await fetchRestRows(
      `servicio_documentos_extra?servicio_id=eq.${encodeURIComponent(row.servicio_id)}` +
        `&tipo=eq.dcdt&select=datos,size_bytes&order=created_at.desc&limit=1`,
    );
    const hit = storageFromExtraDatos(latestRows?.[0]?.datos);
    if (hit) return hit;
  }

  const path = String(datos.pdf_storage_path || "").trim();
  const bucket = String(datos.pdf_storage_bucket || "").trim();
  if (!path || !bucket) return null;
  return { bucket, path, sizeBytes: datos.pdf_size_bytes ?? null, pdfHasQr: datos.pdf_has_qr === true };
}

async function fetchStoragePdf(bucket, objectPath) {
  const { url } = getSupabaseServerEnv();
  const encPath = encodeStorageObjectPath(objectPath);
  const storageUrl = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encPath}`;
  const r = await fetch(storageUrl, { headers: srHeaders() });
  if (!r.ok) return null;
  const contentType = String(r.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.includes("application/pdf") && !contentType.includes("octet-stream")) {
    return null;
  }
  const buffer = Buffer.from(await r.arrayBuffer());
  if (!buffer.length) return null;
  return buffer;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).end();
  }

  const decaPublicId = String(req.query?.id || "").trim();
  if (!decaPublicId || !UUID_RE.test(decaPublicId)) {
    return notFound(res);
  }

  try {
    const row = await fetchDcdtByDecaPublicId(decaPublicId);
    if (!row) return notFound(res);

    const estado = String(row.estado || "").toLowerCase();
    if (!ESTADOS_DESCARGA.has(estado)) return notFound(res);

    const datos = row.datos && typeof row.datos === "object" ? row.datos : {};
    const storage = await resolvePdfStorageLocation(row);
    if (!storage?.path || !storage?.bucket) return notFound(res);

    const storagePath = storage.path;
    const bucket = storage.bucket;

    // TODO (Paso 5): ventana pública DeCA — >7 días naturales tras fin efectivo del servicio → 404.
    // Punto de enganche: aquí, tras validar estado/path y antes de fetchStoragePdf.
    // Ej.: const finServicio = await fetchServicioFechaFin(row.servicio_id);
    // if (isDecaPublicDownloadExpired(finServicio)) return notFound(res);

    const filename = resolvePdfFilename(datos, decaPublicId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (req.method === "HEAD") {
      const pdf = await fetchStoragePdf(bucket, storagePath);
      if (!pdf) return notFound(res);
      res.setHeader("Content-Length", String(pdf.length));
      return res.status(200).end();
    }

    const pdf = await fetchStoragePdf(bucket, storagePath);
    if (!pdf) return notFound(res);
    res.setHeader("Content-Length", String(pdf.length));
    return res.status(200).send(pdf);
  } catch (e) {
    console.error("[dcdt-download]", e?.message || e);
    return res.status(500).end();
  }
}
