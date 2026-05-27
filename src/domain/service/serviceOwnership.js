/**
 * Ownership de servicios — separa flota empresa vs Autónomo PRO (sin empresa obligatoria).
 * Usar ownershipMode en INSERT; no inferir empresa por owner_id en cuentas autónomas.
 */
import { ACCOUNT_TYPES } from "../../auth/accountModel.js";
import { getUserId, sbSelect } from "../../data/supabaseClient.js";
import { SERVICIO_ESTADO_PENDIENTE_ASIGNACION } from "../fleet/servicioAssignment.js";

export const SERVICIO_OWNERSHIP = Object.freeze({
  /** Profesional independiente: servicio propio, empresa_id null, conductor_id = auth.uid */
  AUTONOMO_PRO: "autonomo_pro",
  /** Jefe de flota: servicio de empresa (conductor opcional al crear) */
  FLEET_EMPRESA: "fleet_empresa",
});

export function ownershipModeFromAccountType(accountType) {
  const t = accountType || ACCOUNT_TYPES.CONDUCTOR;
  if (t === ACCOUNT_TYPES.AUTONOMO_PRO) return SERVICIO_OWNERSHIP.AUTONOMO_PRO;
  if (t === ACCOUNT_TYPES.EMPRESA) return SERVICIO_OWNERSHIP.FLEET_EMPRESA;
  return SERVICIO_OWNERSHIP.FLEET_EMPRESA;
}

export function normalizeServicioEmpresaId(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

export function normalizeServicioConductorIdForInsert(conductorId) {
  if (conductorId === undefined || conductorId === null) return null;
  const s = String(conductorId).trim();
  return s || null;
}

/**
 * Resuelve empresa_id solo para flota (owner o vínculo conductor_empresa).
 * Nunca usar para Autónomo PRO.
 */
export async function resolveFleetEmpresaIdForInsert(empresaIdProp, uid = null) {
  const fromProp = normalizeServicioEmpresaId(empresaIdProp);
  if (fromProp) return fromProp;
  const authUid = uid || getUserId?.();
  if (!authUid) return null;
  try {
    const emps = await sbSelect("empresas", `owner_id=eq.${authUid}`);
    const ownerEmp = normalizeServicioEmpresaId(emps?.[0]?.id);
    if (ownerEmp) return ownerEmp;
    const links = await sbSelect("conductor_empresa", `user_id=eq.${authUid}`);
    const link = Array.isArray(links) ? links.find((r) => r?.activo !== false) : links;
    return normalizeServicioEmpresaId(link?.empresa_id);
  } catch {
    return null;
  }
}

/**
 * Contexto INSERT servicios según modo de ownership.
 * @returns {{ empresa_id: string|null, conductor_id: string|null, estado: string }}
 */
export async function resolveServicioInsertContext({
  ownershipMode = SERVICIO_OWNERSHIP.FLEET_EMPRESA,
  empresaIdProp = null,
  conductorIdProp = null,
  estado = null,
  uid = null,
}) {
  const authUid = uid || getUserId?.();

  if (ownershipMode === SERVICIO_OWNERSHIP.AUTONOMO_PRO) {
    if (!authUid) throw new Error("Sesión no válida — inicia sesión de nuevo");
    return {
      empresa_id: null,
      conductor_id: authUid,
      estado: (estado && String(estado).trim()) || "asignado",
    };
  }

  const empresaId = await resolveFleetEmpresaIdForInsert(empresaIdProp, authUid);
  const conductorId = normalizeServicioConductorIdForInsert(conductorIdProp);
  const st =
    conductorId == null
      ? SERVICIO_ESTADO_PENDIENTE_ASIGNACION
      : (estado && String(estado).trim()) || "asignado";

  return {
    empresa_id: empresaId,
    conductor_id: conductorId,
    estado: st,
  };
}

/** El conductor es dueño operativo del servicio (autónomo o asignado a su uid). */
export function conductorOwnsServicio(servicio, conductorUid) {
  if (!servicio?.id || !conductorUid) return false;
  return String(servicio.conductor_id || "") === String(conductorUid);
}

/** Query REST para listar servicios propios del conductor (histórico, docs, timeline). */
export function buildConductorOwnServiciosQuery(uid, { limit = 50 } = {}) {
  const safeLimit = Math.min(120, Math.max(1, Number(limit) || 50));
  return `/rest/v1/servicios?conductor_id=eq.${uid}&order=created_at.desc&limit=${safeLimit}`;
}
