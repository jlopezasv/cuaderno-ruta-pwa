import { isPlatformAdminUid } from "../config/adminUsers.js";
import { isDemoApp, isProductionApp } from "../config/appEnvironment.js";
import { getStoredAuthSession, persistAuthSession } from "../data/authContext.js";
import {
  buildSessionCapabilities,
  deriveFeatureFlags,
  deriveShellCapabilities,
  isHybridCapabilities,
  parseProfileAccount,
} from "./accountModel.js";

export { isHybridCapabilities as isHybridAccount };

export async function resolveAccountCapabilities(uid, sbSelect) {
  if (!uid) {
    return {
      conductor: false,
      empresa: false,
      admin: false,
      accountType: null,
      empresaStatus: null,
      features: {},
    };
  }

  const profiles = await sbSelect("profiles", `id=eq.${uid}`).catch(() => []);
  const profile = profiles[0] || null;
  const account = parseProfileAccount(profile);

  const rels = await sbSelect("conductor_empresa", `user_id=eq.${uid}&activo=eq.true`).catch(() => []);
  const hasFleetLink = rels.length > 0;

  const shells = deriveShellCapabilities(account, {
    hasFleetLink,
    isDemo: isDemoApp(),
    isProduction: isProductionApp(),
  });

  const admin = isPlatformAdminUid(uid);

  return buildSessionCapabilities({
    account,
    shells,
    admin,
    activeMode: "conductor",
    features: deriveFeatureFlags(account, "conductor"),
  });
}

export function resolveActiveMode(capabilities, cachedMode = null) {
  const mode = cachedMode === "empresa" || cachedMode === "conductor" ? cachedMode : null;

  if (capabilities.empresa && capabilities.conductor) {
    if (mode === "conductor") return "conductor";
    return "empresa";
  }
  if (capabilities.empresa) return "empresa";
  if (capabilities.conductor) return "conductor";
  return "conductor";
}

export async function bootstrapAuthSession(uid, sbSelect, options = {}) {
  const base = await resolveAccountCapabilities(uid, sbSelect);
  const cached = options.preferMode ?? getStoredAuthSession(uid)?.activeMode ?? null;
  let activeMode = resolveActiveMode(base, cached);

  if (activeMode === "empresa" && !base.empresa) {
    activeMode = base.conductor ? "conductor" : "conductor";
  }
  if (activeMode === "conductor" && !base.conductor && base.empresa) {
    activeMode = "empresa";
  }

  const profiles = await sbSelect("profiles", `id=eq.${uid}`).catch(() => []);
  const account = parseProfileAccount(profiles[0] || null);
  const features = deriveFeatureFlags(account, activeMode);

  const capabilities = {
    ...base,
    features,
  };

  persistAuthSession({ uid, activeMode, capabilities });

  return { capabilities, activeMode, account };
}
