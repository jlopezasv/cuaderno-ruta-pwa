import { isDemoApp } from "../../config/appEnvironment.js";
import { getEmpresaEquipoCodeStrict } from "./empresaCodigoEquipo.js";
import { resolveEmpresaRecordForUser } from "./empresaOfficeContext.js";

const cache = { empresaId: null, data: null, inflight: null };

/**
 * Completa fila empresas con codigo_equipo de sesión oficina (RPC DEMO).
 * Evita pantalla vacía si RLS bloquea SELECT directo pero el código existe en BD.
 */
export function enrichEmpresaRecordFromOffice(record, officeUser = null) {
  const office = officeUser || null;
  const codigoSesion = String(office?.codigoEquipo || "").trim();
  const empresaId = record?.id || office?.empresaId || null;

  if (!empresaId && !record?.id) return record || null;

  if (!record) {
    if (!office?.empresaId) return null;
    return {
      id: office.empresaId,
      nombre: office.empresaNombre || "Empresa",
      codigo_equipo: codigoSesion || null,
      codigo_corto: codigoSesion || null,
    };
  }

  if (codigoSesion && !getEmpresaEquipoCodeStrict(record)) {
    return {
      ...record,
      codigo_equipo: codigoSesion,
      codigo_corto: record.codigo_corto || codigoSesion,
    };
  }

  return record;
}

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
      if (row) cache.data = row;
      return row;
    })
    .catch(() => {
      cache.inflight = null;
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
    return enrichEmpresaRecordFromOffice(cached, office);
  }
  const row = await resolveEmpresaRecordForUser(uid, sbSelect, office);
  return isDemoApp() ? enrichEmpresaRecordFromOffice(row, office) : row;
}
