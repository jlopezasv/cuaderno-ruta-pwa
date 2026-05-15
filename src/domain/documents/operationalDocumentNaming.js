import { operationalGroupFromStopTipo } from "../service/tripOperationalDossier.js";

function slugPart(value, max = 28) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}

function formatDatePart(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (!Number.isFinite(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

const TIPO_SLUG = {
  cmr: "CMR",
  foto: "Foto",
  incidencia: "Incidencia",
  nota: "Nota",
  qr: "QR",
  albaran: "Albaran",
  justificante: "Justificante",
  documento: "Documento",
};

function stopKindSlug(stop) {
  const g = operationalGroupFromStopTipo(stop?.tipo);
  if (g === "carga") return "Carga";
  if (g === "descarga") return "Descarga";
  if (g === "carga_descarga") return "CargaDescarga";
  return slugPart(stop?.nombre || stop?.tipo || "Parada", 16) || "Parada";
}

/**
 * Nombre operacional identificable: 2026-05-18_CMR_Carga_Mercadona_Murcia_JuanPerez
 */
export function buildOperationalDocumentName({
  tipo = "documento",
  fecha = null,
  cliente = null,
  ciudad = null,
  conductor = null,
  servicioRef = null,
  stop = null,
  subtipo = null,
}) {
  const date = formatDatePart(fecha);
  const tipoLabel = TIPO_SLUG[tipo] || slugPart(tipo, 12) || "Documento";
  const kind = subtipo || stopKindSlug(stop);
  const parts = [
    date,
    tipoLabel,
    slugPart(kind, 20),
    slugPart(cliente, 22),
    slugPart(ciudad, 18),
    slugPart(conductor, 18),
  ].filter(Boolean);
  let name = parts.join("_");
  if (servicioRef && name.length < 48) {
    name += `_${slugPart(servicioRef, 12)}`;
  }
  return name.slice(0, 120) || `${date}_${tipoLabel}`;
}

export function buildOperationalFileName(displayName, ext = "jpg") {
  const base = slugPart(displayName, 100) || "documento";
  return `${base}.${ext.replace(/^\./, "")}`;
}
