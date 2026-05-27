/**
 * TEMP: diagnóstico RLS INSERT servicios vía RPC con el JWT activo del navegador.
 * Requiere migración 20260530120000_debug_servicio_insert_rls_context.sql en Supabase.
 */
import { sbFetch } from "./supabaseClient.js";

/**
 * @param {{ empresaId?: string|null, conductorId?: string|null }} params
 * @returns {Promise<{ ok: boolean, status?: number, data?: object, error?: string }>}
 */
export async function fetchDebugServicioInsertRlsContext({
  empresaId = null,
  conductorId = null,
} = {}) {
  const res = await sbFetch("/rest/v1/rpc/debug_servicio_insert_rls_context", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_empresa_id: empresaId,
      p_conductor_id: conductorId,
    }),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: text || `HTTP ${res.status}`,
    };
  }
  try {
    return { ok: true, data: text ? JSON.parse(text) : null };
  } catch {
    return { ok: true, data: { raw: text } };
  }
}

/**
 * @param {string} label
 * @param {{ empresaId?: string|null, conductorId?: string|null }} params
 */
export async function logDebugServicioInsertRlsContext(label, params = {}) {
  const result = await fetchDebugServicioInsertRlsContext(params);
  console.warn(`[SERVICE_INSERT_RLS_DIAG] ${label}`, result);
  return result;
}
