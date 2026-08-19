import { ACCOUNT_TYPES, normalizeAccountType } from "../../auth/accountModel.js";

/**
 * Mis DeCA (deca_autonomo): documento suelto del conductor.
 * Autónomo PRO, cualquier conductor (con o sin flota) y cuenta empresa que también conduce.
 * El DeCA legal del viaje de empresa sigue siendo dcdt_servicio.
 *
 * `hasFleetLink` se mantiene por compatibilidad con llamadas existentes; ya no oculta Mis DeCA.
 */
export function canUseAutonomoDecaSync({ accountType, hasFleetLink: _hasFleetLink = false, canDrive = false } = {}) {
  const t = normalizeAccountType(accountType);
  if (t === ACCOUNT_TYPES.AUTONOMO_PRO) return true;
  if (t === ACCOUNT_TYPES.CONDUCTOR) return true;
  if (t === ACCOUNT_TYPES.EMPRESA && canDrive) return true;
  return false;
}

export async function resolveCanUseAutonomoDeca(uid, { accountType, hasFleetLink, canDrive = false } = {}) {
  if (!uid) return false;
  return canUseAutonomoDecaSync({ accountType, hasFleetLink: !!hasFleetLink, canDrive });
}
