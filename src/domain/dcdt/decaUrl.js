/**
 * DeCA — URL canónica de descarga pública (única fuente de verdad).
 *
 * Formato: {VITE_DECA_PUBLIC_BASE_URL}/api/dcdt-download?id={deca_public_id}
 * Convención flat alineada con api/dcdt-verify.js (?query en /api/...).
 *
 * Indirección de descarga (sin renombrar ficheros en Storage):
 *   deca_public_id → fila dcdt_servicio → datos.pdf_storage_path (+ pdf_storage_bucket)
 *   → endpoint GET /api/dcdt-download (futuro) streamea application/pdf.
 * Rutas Storage actuales: dcdt/{empresa_id}/{servicio_id}/…
 *
 * Estabilidad del identificador:
 *   deca_public_id permanece al regenerar PDF in-place (misma URL → QR vigente).
 *   Nuevo deca_public_id solo al emitir documento nuevo (relacionado con pdf_dcdt_version).
 *
 * URL base: VITE_DECA_PUBLIC_BASE_URL (obligatoria para PDF/QR; ver buildDecaDownloadUrl).
 */

const MISSING_BASE_ERROR =
  "VITE_DECA_PUBLIC_BASE_URL no está definida. Configúrala en Vercel " +
  "(demo: https://cuaderno-demo-ab.vercel.app). Las URLs DeCA en PDF/QR deben ser absolutas y canónicas.";

/** Normaliza y valida la base pública HTTPS del despliegue. */
export function resolveDecaPublicBaseUrl(raw = import.meta.env.VITE_DECA_PUBLIC_BASE_URL) {
  const trimmed = String(raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`VITE_DECA_PUBLIC_BASE_URL no es una URL válida: ${trimmed}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`VITE_DECA_PUBLIC_BASE_URL debe usar HTTPS (recibido: ${url.protocol})`);
  }
  return url.origin;
}

function resolveDecaPublicBaseUrlForBuild({ allowBrowserOriginFallback = false } = {}) {
  const fromEnv = resolveDecaPublicBaseUrl();
  if (fromEnv) return fromEnv;

  if (allowBrowserOriginFallback && typeof window !== "undefined" && window.location?.origin) {
    const origin = String(window.location.origin).replace(/\/+$/, "");
    if (origin.startsWith("https://") || origin.startsWith("http://localhost")) {
      return origin;
    }
  }

  return "";
}

/**
 * URL HTTPS absoluta de descarga directa del DeCA (identificador único = esta URL).
 *
 * @param {string} decaPublicId
 * @param {{ allowBrowserOriginFallback?: boolean }} [options]
 *   - Por defecto (PDF/QR): exige VITE_DECA_PUBLIC_BASE_URL; lanza error si falta.
 *   - allowBrowserOriginFallback: true → solo UI en vivo (modal); último recurso window.location.origin.
 */
export function buildDecaDownloadUrl(decaPublicId, options = {}) {
  const id = String(decaPublicId || "").trim();
  if (!id) return "";

  const { allowBrowserOriginFallback = false } = options;
  const base = resolveDecaPublicBaseUrlForBuild({ allowBrowserOriginFallback });

  if (!base) {
    throw new Error(MISSING_BASE_ERROR);
  }

  return `${base}/api/dcdt-download?id=${encodeURIComponent(id)}`;
}
