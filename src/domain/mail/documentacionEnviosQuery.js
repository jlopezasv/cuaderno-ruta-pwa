import { sbFetch } from "../../data/supabaseClient.js";
import { pickLatestEnvioRow } from "./clienteMailEnvioStatus.js";

const CHUNK = 40;

const SELECT_COLS =
  "id,servicio_id,empresa_id,destinatarios,destinatario,cc,asunto,mensaje,adjuntos,estado,error_detalle,remitente_mostrado,reply_to,provider,provider_message_id,enviado_por,created_at,sent_at";

/**
 * Último envío documentación por servicio_id (demo / empresa).
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchLatestDocumentacionEnvioByServicioIds(servicioIds) {
  const ids = [...new Set((Array.isArray(servicioIds) ? servicioIds : []).filter(Boolean))];
  if (!ids.length) return {};
  const all = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    let r = await sbFetch(
      `/rest/v1/documentacion_envios?servicio_id=in.(${slice.join(",")})&order=created_at.desc&select=${SELECT_COLS}`,
    );
    if (!r.ok) {
      r = await sbFetch(
        `/rest/v1/documentacion_envios?servicio_id=in.(${slice.join(",")})&order=created_at.desc&select=id,servicio_id,destinatarios,cc,asunto,mensaje,adjuntos,estado,error_detalle,enviado_por,created_at,sent_at`,
      );
    }
    if (!r.ok) continue;
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows)) all.push(...rows);
  }
  const byServicio = {};
  for (const row of all) {
    const sid = row?.servicio_id;
    if (!sid) continue;
    if (!byServicio[sid]) byServicio[sid] = [];
    byServicio[sid].push(row);
  }
  const out = {};
  for (const [sid, rows] of Object.entries(byServicio)) {
    out[sid] = pickLatestEnvioRow(rows);
  }
  return out;
}

/** Nombres de perfiles para historial (enviado_por). */
export async function fetchNombresByUserIds(userIds) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  if (!ids.length) return {};
  const r = await sbFetch(`/rest/v1/profiles?id=in.(${ids.join(",")})&select=id,nombre`);
  if (!r.ok) return {};
  const rows = await r.json().catch(() => []);
  const out = {};
  if (Array.isArray(rows)) {
    for (const p of rows) {
      if (p?.id) out[p.id] = String(p.nombre || "").trim() || "Usuario";
    }
  }
  return out;
}
