import { getUserId, sbFetch } from "../../data/supabaseClient";

const TABLE = "servicio_documentos_extra";

export const EXTRA_DOC_TIPOS = Object.freeze([
  { id: "cmr", label: "CMR" },
  { id: "ticket", label: "Ticket" },
  { id: "factura", label: "Factura" },
  { id: "incidencia", label: "Incidencia" },
  { id: "foto", label: "Foto" },
  { id: "otro", label: "Otro" },
]);

export async function fetchServicioDocumentosExtra(servicioId) {
  if (!servicioId) return [];
  try {
    const r = await sbFetch(`/rest/v1/${TABLE}?servicio_id=eq.${servicioId}&order=created_at.desc`);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export async function insertServicioDocumentoExtra({ servicioId, tipo, descripcion, url, archivoNombre }) {
  const uid = getUserId();
  const body = {
    servicio_id: servicioId,
    tipo: String(tipo || "otro"),
    descripcion: descripcion?.trim() || null,
    url: url || null,
    archivo_nombre: archivoNombre || null,
    creado_por: uid,
  };
  const r = await sbFetch(`/rest/v1/${TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `HTTP ${r.status}`);
  }
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function deleteServicioDocumentoExtra(id) {
  await sbFetch(`/rest/v1/${TABLE}?id=eq.${id}`, { method: "DELETE" });
}
