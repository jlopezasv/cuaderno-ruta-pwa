import { sbFetch } from "../../data/supabaseClient.js";

/**
 * Registra filas en `servicio_cambios` (migración requerida).
 * Falla en silencio si la tabla no existe o RLS rechaza.
 */
export async function insertServicioCambiosRows(rows) {
  if (!rows?.length) return;
  for (const row of rows) {
    if (!row?.servicio_id || !row?.campo) continue;
    await sbFetch("/rest/v1/servicio_cambios", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row),
    }).catch(() => {});
  }
}

export function fmtAuditVal(v) {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 2000 ? `${s.slice(0, 1997)}…` : s;
}
