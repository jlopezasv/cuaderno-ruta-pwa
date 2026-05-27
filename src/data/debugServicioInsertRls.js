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
 * @param {object|null|undefined} data
 * @returns {string}
 */
export function formatServicioRlsDiagSummary(data) {
  if (!data || typeof data !== "object") return "sin_datos_rpc";
  const b = data.autonomo_branch_checks || {};
  const policies = Array.isArray(data.insert_policies) ? data.insert_policies : [];
  const policyNames = policies.map((p) => p.name).filter(Boolean).join(",") || "ninguna";
  return [
    `can_insert=${data.user_can_insert_servicio}`,
    `is_autonomo_pro=${data.user_profile_is_autonomo_pro}`,
    `tipo_cuenta=${data.tipo_cuenta_invoker ?? "null"}`,
    `profile_exists=${data.profile_exists_invoker}`,
    `auth_uid_pg=${data.auth_uid ?? "null"}`,
    `auth_role=${data.auth_role ?? "null"}`,
    `jwt_sub=${data.jwt_sub ?? "null"}`,
    `insert_policies=${policyNames}`,
    `branch=${JSON.stringify(b)}`,
  ].join(" | ");
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
