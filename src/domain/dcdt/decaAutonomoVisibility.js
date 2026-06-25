import { ACCOUNT_TYPES, normalizeAccountType } from "../../auth/accountModel.js";
import { fetchActiveConductorEmpresaRows } from "../empresa/conductorEmpresaLink.js";

/**
 * DeCA autónomo: autónomo PRO o conductor sin vínculo activo a flota empresa.
 * Conductores asignados a empresa usan DeCA del servicio (panel empresa).
 */
export function canUseAutonomoDecaSync({ accountType, hasFleetLink = false }) {
  const t = normalizeAccountType(accountType);
  if (t === ACCOUNT_TYPES.AUTONOMO_PRO) return true;
  if (t === ACCOUNT_TYPES.CONDUCTOR && !hasFleetLink) return true;
  return false;
}

export async function resolveCanUseAutonomoDeca(uid, { accountType, hasFleetLink } = {}) {
  if (!uid) return false;
  if (hasFleetLink !== undefined) {
    return canUseAutonomoDecaSync({ accountType, hasFleetLink });
  }
  const rels = await fetchActiveConductorEmpresaRows(uid).catch(() => []);
  return canUseAutonomoDecaSync({ accountType, hasFleetLink: rels.length > 0 });
}
