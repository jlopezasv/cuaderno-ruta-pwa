import { sbFetch } from "../../data/supabaseClient.js";

const STOP_TIPOS_SAFE = new Set([
  "carga",
  "descarga",
  "parada_tecnica",
  "aduana",
  "pernocta",
  "parada",
]);

/**
 * Filas listas para PostgREST (`stops`), sin columnas opcionales que puedan no existir en BD.
 */
export function buildStopsInsertRows(servicioId, stops) {
  if (!servicioId || !Array.isArray(stops) || !stops.length) return [];
  const sorted = [...stops].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  return sorted.map((s, index) => {
    const tipoRaw = String(s.tipo || "parada").trim().toLowerCase();
    const tipo = STOP_TIPOS_SAFE.has(tipoRaw) ? tipoRaw : "parada";
    const nombre = String(s.nombre || "").trim();
    if (!nombre) return null;
    return {
      servicio_id: servicioId,
      orden: index + 1,
      tipo,
      nombre,
      direccion: String(s.direccion || "").trim() || null,
      notas: String(s.notas || "").trim() || null,
      estado: "pendiente",
    };
  }).filter(Boolean);
}

function parseInsertErrorDetail(res, fallbackText) {
  if (res?.status === 401) return "Sesión caducada. Vuelve a iniciar sesión.";
  if (res?.status === 403 || res?.status === 42501) {
    return (
      "Sin permiso para crear paradas. Asigna el conductor antes o ejecuta en Supabase la migración " +
      "20260522120000_stops_rls_conductor_empresa.sql (SQL Editor)."
    );
  }
  const t = String(fallbackText || "").trim();
  if (t.includes("column") && t.includes("lat")) {
    return "El servidor no admite coordenadas en paradas; se guardarán solo nombre y dirección.";
  }
  if (t.length > 0 && t.length < 220) return t;
  if (res?.status) return `Error al guardar paradas (${res.status})`;
  return "No se pudieron crear las paradas del servicio";
}

/**
 * INSERT en `stops`: lote y, si falla, una a una.
 * @returns {{ ok: boolean, rows?: object[], error?: string, partial?: boolean }}
 */
export async function insertStopsForServicio(servicioId, stops) {
  const rows = buildStopsInsertRows(servicioId, stops);
  if (!rows.length) {
    return { ok: false, error: "No hay paradas válidas para guardar (falta nombre)." };
  }

  const postBatch = async (payload) => {
    const res = await sbFetch("/rest/v1/stops", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, detail, res };
    }
    const data = await res.json().catch(() => []);
    return { ok: true, data: Array.isArray(data) ? data : [data] };
  };

  let batch = await postBatch(rows);
  if (batch.ok) return { ok: true, rows: batch.data };

  const inserted = [];
  let lastFail = batch;
  for (const row of rows) {
    const one = await postBatch([row]);
    if (one.ok) {
      inserted.push(...(one.data || []));
    } else {
      lastFail = one;
    }
  }

  if (inserted.length === rows.length) {
    return { ok: true, rows: inserted, partial: false };
  }
  if (inserted.length > 0) {
    return {
      ok: true,
      rows: inserted,
      partial: true,
      error: `Solo se guardaron ${inserted.length} de ${rows.length} paradas.`,
    };
  }

  return {
    ok: false,
    error: parseInsertErrorDetail(lastFail.res, lastFail.detail),
    detail: lastFail.detail,
    status: lastFail.status,
  };
}
