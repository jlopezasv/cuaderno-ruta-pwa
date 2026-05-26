import { isPlatformAdminUid } from "../config/adminUsers.js";
import { getStoredAuthSession, persistAuthSession } from "../data/authContext.js";

export async function resolveAccountCapabilities(uid, sbSelect) {
  if (!uid) {
    return { conductor: false, empresa: false, admin: false };
  }

  const capabilities = {
    conductor: true,
    empresa: false,
    admin: isPlatformAdminUid(uid),
  };

  const ownerEmpresas = await sbSelect("empresas", `owner_id=eq.${uid}`).catch(() => []);
  if (ownerEmpresas.length) {
    capabilities.empresa = true;
    return capabilities;
  }

  const profiles = await sbSelect("profiles", `id=eq.${uid}`).catch(() => []);
  if (profiles[0]?.tipo_cuenta === "empresa") {
    capabilities.empresa = true;
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
