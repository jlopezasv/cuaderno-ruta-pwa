/**
 * TEMP: trazado paso a paso al crear servicio (identificar tabla RLS 42501).
 */
import { isDemoApp } from "../../config/appEnvironment.js";

export const SERVICE_CREATE_STEP_TRACE = import.meta.env.DEV && isDemoApp();

/** @param {string} text */
export function parsePostgrestError(text) {
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* plain text */
  }
  const message = String(json?.message || text || "").trim();
  const tableMatch = message.match(/table "([^"]+)"/i);
  return {
    code: json?.code || "",
    message,
    table: tableMatch?.[1] || null,
    details: json?.details || null,
    hint: json?.hint || null,
  };
}

/**
 * @param {Response} res
 * @param {string} stepId
 * @param {string} [tableHint]
 */
export async function assertPostgrestOk(res, stepId, tableHint = "unknown") {
  if (res?.ok) return res;
  const text = await res.text().catch(() => "");
  const parsed = parsePostgrestError(text);
  const table = parsed.table || tableHint;
  const msg =
    parsed.code === "42501"
      ? `RLS 42501 en "${table}" [${stepId}]: ${parsed.message || text}`
      : `HTTP ${res.status} en "${table}" [${stepId}]: ${parsed.message || text || res.status}`;
  const err = new Error(msg);
  err.stepId = stepId;
  err.httpStatus = res.status;
  err.pgCode = parsed.code;
  err.pgTable = table;
  err.raw = text;
  throw err;
}

/**
 * @template T
 * @param {string} stepId
 * @param {Record<string, unknown>|null|undefined} meta
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function traceServiceCreateStep(stepId, meta, fn) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (SERVICE_CREATE_STEP_TRACE) {
    console.warn(`[SERVICE_CREATE_STEP] ▶ ${stepId}`, meta || {});
  }
  try {
    const result = await fn();
    if (SERVICE_CREATE_STEP_TRACE) {
      const ms = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
      );
      console.warn(`[SERVICE_CREATE_STEP] ✓ ${stepId}`, { ms });
    }
    return result;
  } catch (err) {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    if (!wrapped.stepId) wrapped.stepId = stepId;
    if (SERVICE_CREATE_STEP_TRACE) {
      const ms = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
      );
      console.error(`[SERVICE_CREATE_STEP] ✗ ${stepId}`, {
        ms,
        stepId: wrapped.stepId,
        pgTable: wrapped.pgTable ?? null,
        pgCode: wrapped.pgCode ?? null,
        message: wrapped.message,
        meta,
      });
    }
    throw wrapped;
  }
}

/** @param {Error & { stepId?: string, pgTable?: string }} err */
export function formatServiceCreateStepError(err) {
  const step = err?.stepId ? `[${err.stepId}] ` : "";
  const table = err?.pgTable ? `tabla=${err.pgTable} · ` : "";
  return `${step}${table}${err?.message || String(err)}`.trim();
}
