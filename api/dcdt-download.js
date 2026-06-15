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
  for (const table of DCDT_TABLES) {
    const apiPath =
      `${url}/rest/v1/${table}?deca_public_id=eq.${enc}` +
      "&select=id,servicio_id,estado,datos,validado_at&limit=1";
    const r = await fetch(apiPath, { headers: srJsonHeaders() });
    if (!r.ok) continue;
    const rows = await r.json();
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  return null;
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
    const storagePath = String(datos.pdf_storage_path || "").trim();
    if (!storagePath) return notFound(res);

    const bucket = String(datos.pdf_storage_bucket || "").trim();
    if (!bucket) return notFound(res);

    // TODO (Paso 5): ventana pública DeCA — >7 días naturales tras fin efectivo del servicio → 404.
    // Punto de enganche: aquí, tras validar estado/path y antes de fetchStoragePdf.
    // Ej.: const finServicio = await fetchServicioFechaFin(row.servicio_id);
    // if (isDecaPublicDownloadExpired(finServicio)) return notFound(res);

    const filename = resolvePdfFilename(datos, decaPublicId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "public, max-age=300");

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
