import { isDemoApp } from "../../config/appEnvironment.js";
import { resolveEmpresaRecordForUser } from "./empresaOfficeContext.js";

const cache = { empresaId: null, data: null, inflight: null };

/** @param {Function} sbSelect */
export async function fetchEmpresaRecordById(sbSelect, empresaId, { force = false } = {}) {
  if (!empresaId) return null;

  if (!force && cache.empresaId === empresaId && cache.data) {
    return cache.data;
  }
  if (!force && cache.empresaId === empresaId && cache.inflight) {
    return cache.inflight;
  }

  cache.empresaId = empresaId;
  cache.inflight = sbSelect(
    "empresas",
    `id=eq.${empresaId}&select=id,nombre,cif,codigo_equipo,codigo_corto,owner_id`,
  )
    .then((rows) => {
      cache.inflight = null;
      const row = Array.isArray(rows) ? rows[0] || null : null;
      cache.data = row;
      return row;
    })
    .catch(() => {
      cache.inflight = null;
      cache.data = null;
      return null;
    });

  return cache.inflight;
}

export function invalidateEmpresaRecordCache(empresaId = null) {
  if (empresaId == null || cache.empresaId === empresaId) {
    cache.empresaId = null;
    cache.data = null;
    cache.inflight = null;
  }
}

/**
 * Resuelve empresa actual: officeUser.empresaId primero en DEMO, luego owner.
 * @param {Function} sbSelect
 */
export async function resolveCurrentEmpresaRecord(sbSelect, uid, officeUser = null) {
  const office = officeUser || null;
  if (isDemoApp() && office?.empresaId) {
    const cached = await fetchEmpresaRecordById(sbSelect, office.empresaId);
    if (cached) return cached;
  }
  return resolveEmpresaRecordForUser(uid, sbSelect, office);
}
