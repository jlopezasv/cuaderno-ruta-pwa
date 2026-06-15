// api/dcdt-download.js — Descarga pública directa DeCA (PDF binario, sin auth)
import { getSupabaseServiceRoleKey, getSupabaseServerEnv } from "./_lib/supabaseEnv.js";
import {
  DECA_PUBLIC_DOWNLOAD_DAYS,
  isDecaPublicDownloadExpired,
  resolveServicioFinEfectivoAt,
} from "../src/domain/dcdt/decaRetention.js";

const DCDT_TABLES = ["dcdt_servicio", "carta_porte_servicio"];
const ESTADOS_DESCARGA = new Set(["validado", "incluido_en_expediente"]);

function isDecaPubliclyDownloadable(row, datos) {
  const estado = String(row?.estado || "").toLowerCase();
  if (ESTADOS_DESCARGA.has(estado)) return true;
  const hasPdf = !!(String(datos?.pdf_storage_path || "").trim() || row?.pdf_generado_at);
  return hasPdf && estado === "pendiente_validacion";
}
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

function notFound(res, reason = "") {
  const isDemo = /^(demo|1|true)$/i.test(String(process.env.APP_ENV || process.env.VITE_APP_ENV || ""));
  if (isDemo && reason) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(404).send(reason);
  }
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
  const select = "id,servicio_id,estado,datos,validado_at,pdf_generado_at";
  const filters = [
    `deca_public_id=eq.${enc}`,
    `datos->>deca_public_id=eq.${enc}`,
    `datos->>deca_download_url=ilike.*${enc}*`,
  ];
  for (const table of DCDT_TABLES) {
    for (const filter of filters) {
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
  const bucket = String(
    extraDatos.bucket || extraDatos.pdf_storage_bucket || "user-photos",
  ).trim();
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
  const bucket = String(datos.pdf_storage_bucket || "user-photos").trim();
  if (!path || !bucket) return null;
  return { bucket, path, sizeBytes: datos.pdf_size_bytes ?? null, pdfHasQr: datos.pdf_has_qr === true };
}

async function fetchServicioById(servicioId) {
  if (!servicioId) return null;
  const rows = await fetchRestRows(
    `servicios?id=eq.${encodeURIComponent(servicioId)}&select=estado,referencia,updated_at&limit=1`,
  );
  return rows?.[0] ?? null;
}

async function fetchStoragePdf(bucket, objectPath) {
  const { url } = getSupabaseServerEnv();
  const encPath = encodeStorageObjectPath(objectPath);
  const encBucket = encodeURIComponent(bucket);
  const candidates = [
    `${url}/storage/v1/object/${encBucket}/${encPath}`,
    `${url}/storage/v1/object/authenticated/${encBucket}/${encPath}`,
  ];
  for (const storageUrl of candidates) {
    const r = await fetch(storageUrl, { headers: srHeaders() });
    if (!r.ok) continue;
    const contentType = String(r.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("application/pdf") && !contentType.includes("octet-stream")) {
      continue;
    }
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length) return buffer;
  }
  return null;
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
    return notFound(res, "DeCA: id invalido (debe ser UUID). Copia la URL del modal «Mostrar QR DeCA».");
  }

  try {
    const row = await fetchDcdtByDecaPublicId(decaPublicId);
    if (!row) {
      return notFound(
        res,
        "DeCA: no hay DCDT con ese id. Genera el PDF de nuevo y usa la URL exacta del QR.",
      );
    }

    const estado = String(row.estado || "").toLowerCase();
    const datos = row.datos && typeof row.datos === "object" ? row.datos : {};
    if (!isDecaPubliclyDownloadable(row, datos)) {
      return notFound(res, `DeCA: DCDT en estado «${estado || "?"}». Genera el PDF o valida el documento.`);
    }

    const storage = await resolvePdfStorageLocation(row);
    if (!storage?.path || !storage?.bucket) {
      return notFound(res, "DeCA: PDF no registrado en storage. Pulsa «Generar PDF DCDT» en el modal.");
    }

    const storagePath = storage.path;
    const bucket = storage.bucket;

    if (row.servicio_id) {
      const servicio = await fetchServicioById(row.servicio_id);
      const finEfectivo = resolveServicioFinEfectivoAt(servicio);
      if (finEfectivo && isDecaPublicDownloadExpired(finEfectivo)) {
        return notFound(
          res,
          `DeCA: ventana pública cerrada (>${DECA_PUBLIC_DOWNLOAD_DAYS} días naturales tras finalizar el servicio). ` +
            "El PDF sigue conservado en el expediente; solicítelo a la empresa transportista.",
        );
      }
    }

    const filename = resolvePdfFilename(datos, decaPublicId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (req.method === "HEAD") {
      const pdf = await fetchStoragePdf(bucket, storagePath);
      if (!pdf) return notFound(res, "DeCA: fichero PDF no encontrado en storage. Regenera el PDF.");
      res.setHeader("Content-Length", String(pdf.length));
      return res.status(200).end();
    }

    const pdf = await fetchStoragePdf(bucket, storagePath);
    if (!pdf) return notFound(res, "DeCA: fichero PDF no encontrado en storage. Regenera el PDF.");
    res.setHeader("Content-Length", String(pdf.length));
    return res.status(200).send(pdf);
  } catch (e) {
    console.error("[dcdt-download]", e?.message || e);
    return res.status(500).end();
  }
}
