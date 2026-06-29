import { sbFetch } from "../../data/supabaseClient.js";
import { validarMovimientoDeCaVivo } from "./decaVivoStock.js";
import { humanizeApiError } from "../api/humanizeApiError.js";

function parseRpcJson(response, userMessage = "No se pudo completar la operación.") {
  if (!response.ok) {
    return response.text().then((t) => {
      throw humanizeApiError(new Error(t || `RPC error ${response.status}`), userMessage);
    });
  }
  return response.json();
}

/** @typedef {import('./decaVivoConstants.js').DECA_VIVO_MOVIMIENTO} DecaVivoMovimiento */

/**
 * @typedef {object} DecaVivoVisible
 * @property {string} servicio_id
 * @property {object|null} documento
 * @property {Array<object>} stock_actual
 * @property {Array<object>} ultimos_movimientos
 */

/**
 * Obtiene el DeCA actual visible del servicio (único documento vigente).
 * @param {string} servicioId
 * @returns {Promise<DecaVivoVisible|null>}
 */
export async function fetchDecaActualVisible(servicioId) {
  if (!servicioId) return null;
  const r = await sbFetch("/rest/v1/rpc/obtener_deca_actual_visible", {
    method: "POST",
    body: JSON.stringify({ p_servicio_id: servicioId }),
  });
  const data = await parseRpcJson(r);
  return data && typeof data === "object" ? data : null;
}

/**
 * FASE A — Inserta movimiento y recalcula inventario a bordo (sin documento DeCA).
 * @param {object} payload
 * @returns {Promise<{ ok: boolean, movimiento_id: string, stock_actual: Array }>}
 */
export async function insertarMovimientoCarga(payload, stockActual = []) {
  const check = validarMovimientoDeCaVivo(payload, stockActual);
  if (!check.ok) throw new Error(check.error);

  console.debug("[carga] insertar_movimiento_carga", {
    servicio_id: payload.servicio_id,
    tipo: payload.tipo_movimiento,
    descripcion: payload.descripcion_mercancia,
    cantidad: payload.cantidad,
    unidad: payload.unidad,
  });

  const r = await sbFetch("/rest/v1/rpc/insertar_movimiento_carga", {
    method: "POST",
    body: JSON.stringify({ p_payload: payload }),
  });
  const data = await parseRpcJson(r, "No se pudo registrar la carga.");
  console.debug("[carga] movimiento insertado", data?.movimiento_id, data?.stock_actual?.length);
  return data;
}

/**
 * Registra movimiento (FASE A) e intenta actualizar DeCA (FASE B, no bloquea).
 * @param {object} payload
 * @returns {Promise<DecaVivoVisible & { deca_pending?: boolean }>}
 */
export async function registrarMovimientoCarga(payload, stockActual = []) {
  const check = validarMovimientoDeCaVivo(payload, stockActual);
  if (!check.ok) throw new Error(check.error);

  console.debug("[carga] registrar_movimiento_carga", {
    servicio_id: payload.servicio_id,
    tipo: payload.tipo_movimiento,
  });

  const r = await sbFetch("/rest/v1/rpc/registrar_movimiento_carga", {
    method: "POST",
    body: JSON.stringify({ p_payload: payload }),
  });
  const data = await parseRpcJson(r, "No se pudo registrar la carga.");
  if (data?.deca_pending) {
    console.warn("[carga] DeCA pendiente tras movimiento", data.movimiento_id);
  }
  return data;
}

/**
 * Fuerza recálculo del DeCA actual desde movimientos.
 * @param {string} servicioId
 */
export async function recalcularDecaActual(servicioId) {
  const r = await sbFetch("/rest/v1/rpc/recalcular_deca_actual", {
    method: "POST",
    body: JSON.stringify({ p_servicio_id: servicioId }),
  });
  return parseRpcJson(r);
}

/**
 * Genera/refresca token QR de inspección del DeCA actual.
 * @param {string} servicioId
 */
export async function generarQrDecaActual(servicioId) {
  const r = await sbFetch("/rest/v1/rpc/generar_qr_deca_actual", {
    method: "POST",
    body: JSON.stringify({ p_servicio_id: servicioId }),
  });
  return parseRpcJson(r);
}

/**
 * URL pública de inspección DeCA vivo (vista mínima, sin historial interno).
 * @param {string} qrToken
 */
export function buildDecaVivoInspectUrl(qrToken) {
  const base = String(import.meta.env.VITE_DECA_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (!base) return `/api/deca-vivo-inspect?token=${encodeURIComponent(qrToken)}`;
  return `${base}/api/deca-vivo-inspect?token=${encodeURIComponent(qrToken)}`;
}

/**
 * Historial de versiones DeCA (lectura directa PostgREST).
 * @param {string} servicioId
 */
export async function fetchDecaVersionesHistorial(servicioId) {
  const enc = encodeURIComponent(servicioId);
  const r = await sbFetch(
    `/rest/v1/deca_versiones_historial?servicio_id=eq.${enc}&select=id,deca_id,version,snapshot_json,motivo,creado_en&order=version.desc&limit=50`,
  );
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

/**
 * Todos los movimientos del servicio (trazabilidad completa).
 * @param {string} servicioId
 */
export async function fetchDecaMovimientos(servicioId) {
  const enc = encodeURIComponent(servicioId);
  const r = await sbFetch(
    `/rest/v1/deca_movimientos_carga?servicio_id=eq.${enc}&select=*&order=fecha_hora.asc,created_at.asc`,
  );
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

/** Detecta si el backend DeCA vivo está disponible (tabla migrada). */
export async function isDecaVivoBackendAvailable() {
  try {
    const r = await sbFetch("/rest/v1/deca_documentos?select=id&limit=1");
    return r.status !== 404 && r.status !== 406;
  } catch {
    return false;
  }
}
