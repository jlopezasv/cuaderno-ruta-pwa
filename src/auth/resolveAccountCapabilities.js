import { isSuperadminUser } from "../config/superadminUsers.js";
import { getSession } from "../data/supabaseClient.js";
import { isDemoApp, isProductionApp } from "../config/appEnvironment.js";
import { ACCOUNT_TYPES, parseProfileAccount } from "./accountModel.js";
import { getStoredAuthSession, persistAuthSession } from "../data/authContext.js";
import { fetchActiveConductorEmpresaRows } from "../domain/empresa/conductorEmpresaLink.js";
import { buildOfficeUserCapabilities } from "../domain/empresa/empresaOfficeContext.js";
import { ensureAuthAccessToken } from "../data/supabaseClient.js";
import {
  buildSessionCapabilities,
  deriveFeatureFlags,
  deriveShellCapabilities,
  isHybridCapabilities,
} from "./accountModel.js";
import {
  BOOTSTRAP_ERRORS,
  fetchOfficeUserContextRpc,
} from "./officeBootstrap.js";

export { isHybridCapabilities as isHybridAccount };

/**
 * @param {object} [prefetched]
 * @param {object|null} [prefetched.profile]
 * @param {object|null} [prefetched.officeUser]
 * @param {boolean} [prefetched.hasFleetLink]
 */
export async function resolveAccountCapabilities(uid, sbSelect, prefetched = {}) {
  if (!uid) {
    return {
      conductor: false,
      empresa: false,
      admin: false,
      accountType: null,
      empresaStatus: null,
      officeUser: null,
      bootstrapError: null,
      features: {},
    };
  }

  const profile =
    prefetched.profile !== undefined
      ? prefetched.profile
      : (await sbSelect("profiles", `id=eq.${uid}`).catch(() => []))[0] || null;

  const account = parseProfileAccount(profile);
  const isDemo = isDemoApp();

  let officeUser =
    prefetched.officeUser !== undefined ? prefetched.officeUser : null;
  if (prefetched.officeUser === undefined) {
    officeUser = await fetchOfficeUserContextRpc();
  }

  let hasFleetLink = prefetched.hasFleetLink;
  if (hasFleetLink === undefined) {
    const needsFleetCheck =
      account.accountType !== ACCOUNT_TYPES.EMPRESA ||
      account.canDrive ||
      !officeUser?.activo;
    if (needsFleetCheck) {
      const rels = await fetchActiveConductorEmpresaRows(uid).catch(() => []);
      hasFleetLink = rels.length > 0;
    } else {
      hasFleetLink = false;
    }
  }

  const shells = deriveShellCapabilities(account, {
    hasFleetLink,
    isDemo,
    isProduction: isProductionApp(),
  });

  if (officeUser?.activo) {
    shells.empresa = true;
    if (officeUser.rol === "administrativo") {
      shells.conductor = false;
    }
  }

  let bootstrapError = null;
  if (!profile) {
    bootstrapError = BOOTSTRAP_ERRORS.NO_PROFILE;
  } else if (officeUser && !officeUser.activo) {
    bootstrapError = BOOTSTRAP_ERRORS.OFFICE_INACTIVE;
  }

  const admin = isSuperadminUser(uid, getSession()?.user?.email);

  return buildSessionCapabilities({
    account,
    shells,
    admin,
    activeMode: "conductor",
    officeUser,
    bootstrapError,
    features: deriveFeatureFlags(account, "conductor", { isDemo, officeUser }),
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
  await ensureAuthAccessToken();
  const profiles = await sbSelect("profiles", `id=eq.${uid}`).catch(() => []);
  const profile = profiles[0] || null;

  const officeUser = await fetchOfficeUserContextRpc();

  let hasFleetLink;
  const account = parseProfileAccount(profile);
  const needsFleetCheck =
    account.accountType !== ACCOUNT_TYPES.EMPRESA ||
    account.canDrive ||
    !officeUser?.activo;

  const prefetched = options.prefetched || {};
  if (prefetched.hasFleetLink !== undefined) {
    hasFleetLink = !!prefetched.hasFleetLink;
  } else if (needsFleetCheck) {
    const rels = await fetchActiveConductorEmpresaRows(uid).catch(() => []);
    hasFleetLink = rels.length > 0;
  } else {
    hasFleetLink = false;
  }

  const base = await resolveAccountCapabilities(uid, sbSelect, {
    profile,
    officeUser,
    hasFleetLink,
  });

  const cached = options.preferMode ?? getStoredAuthSession(uid)?.activeMode ?? null;
  let activeMode = resolveActiveMode(base, cached);

  if (activeMode === "empresa" && !base.empresa) {
    activeMode = base.conductor ? "conductor" : "conductor";
  }
  if (activeMode === "conductor" && !base.conductor && base.empresa) {
    activeMode = "empresa";
  }

  if (activeMode === "empresa" && !base.empresa && !base.bootstrapError) {
    base.bootstrapError = BOOTSTRAP_ERRORS.NO_EMPRESA_SHELL;
  }

  const features = deriveFeatureFlags(account, activeMode, {
    isDemo: isDemoApp(),
    officeUser: base.officeUser || null,
  });

  const capabilities = { ...base, features };

  persistAuthSession({ uid, activeMode, capabilities });

  return { capabilities, activeMode, account, officeUser: base.officeUser || null };
}
