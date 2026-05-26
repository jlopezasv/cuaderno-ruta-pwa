import { isPlatformAdminUid } from "../config/adminUsers.js";
import { getStoredAuthSession, persistAuthSession } from "../data/authContext.js";

const OPERATOR_ACCOUNT_TYPES = new Set(["autonomo", "conductor"]);

function isOperatorAccountType(tipoCuenta) {
  return OPERATOR_ACCOUNT_TYPES.has(tipoCuenta || "autonomo");
}

export async function resolveAccountCapabilities(uid, sbSelect) {
  if (!uid) {
    return { conductor: false, empresa: false, admin: false };
  }

  const profiles = await sbSelect("profiles", `id=eq.${uid}`).catch(() => []);
  const profile = profiles[0] || null;
  const tipoCuenta = profile?.tipo_cuenta || "autonomo";

  const capabilities = {
    empresa: false,
    conductor: false,
    admin: isPlatformAdminUid(uid),
  };

  const ownerEmpresas = await sbSelect("empresas", `owner_id=eq.${uid}`).catch(() => []);
  if (ownerEmpresas.length || tipoCuenta === "empresa") {
    capabilities.empresa = true;
  }

  if (isOperatorAccountType(tipoCuenta)) {
    capabilities.conductor = true;
  } else if (profile?.can_drive === true) {
    capabilities.conductor = true;
  } else {
    const rels = await sbSelect("conductor_empresa", `user_id=eq.${uid}&activo=eq.true`).catch(() => []);
    if (rels.length) {
      capabilities.conductor = true;
    }
  }

  return capabilities;
}

export function resolveActiveMode(capabilities, cachedMode = null) {
  const mode = cachedMode === "empresa" || cachedMode === "conductor" ? cachedMode : null;

  if (capabilities.empresa && capabilities.conductor) {
    if (mode === "conductor") return "conductor";
    return "empresa";
  }
  if (capabilities.empresa) return "empresa";
  return "conductor";
}

export function isHybridAccount(capabilities) {
  return !!capabilities?.empresa && !!capabilities?.conductor;
}

export async function bootstrapAuthSession(uid, sbSelect, options = {}) {
  const capabilities = await resolveAccountCapabilities(uid, sbSelect);
  const cached = options.preferMode ?? getStoredAuthSession(uid)?.activeMode ?? null;
  const activeMode = resolveActiveMode(capabilities, cached);

  persistAuthSession({ uid, activeMode, capabilities });

  return { capabilities, activeMode };
}
