import { isSuperadminUser } from "../config/superadminUsers.js";
import { isDemoApp, isProductionApp } from "../config/appEnvironment.js";
import { getStoredAuthSession, persistAuthSession } from "../data/authContext.js";
import { fetchActiveConductorEmpresaRows } from "../domain/empresa/conductorEmpresaLink.js";
import { ensureAuthAccessToken, getSession } from "../data/supabaseClient.js";
import {
  ACCOUNT_TYPES,
  buildSessionCapabilities,
  deriveFeatureFlags,
  deriveShellCapabilities,
  isHybridCapabilities,
  parseProfileAccount,
} from "./accountModel.js";
import { userIsEmpresaOwner } from "../domain/empresa/officeUserLinkage.js";
import {
  BOOTSTRAP_ERRORS,
  fetchOfficeUserContext,
} from "./officeBootstrap.js";
import { fetchOfficeUserLinkRow } from "../domain/empresa/officeUserLinkage.js";
import { profileMustChangePassword } from "../domain/auth/mustChangePassword.js";

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

  const sessionEmail = getSession()?.user?.email;
  if (isSuperadminUser(uid, sessionEmail)) {
    const profile =
      prefetched.profile !== undefined
        ? prefetched.profile
        : (await sbSelect("profiles", `id=eq.${uid}`).catch(() => []))[0] || null;
    const account = parseProfileAccount(profile);
    return buildSessionCapabilities({
      account,
      shells: { conductor: false, empresa: false },
      admin: true,
      activeMode: "propietario",
      officeUser: null,
      bootstrapError: null,
      mustChangePassword: profileMustChangePassword(profile),
      features: {},
    });
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
    officeUser = await fetchOfficeUserContext(uid);
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
  } else if (
    account.accountType === ACCOUNT_TYPES.EMPRESA &&
    !account.canDrive &&
  !(await userIsEmpresaOwner(uid, sbSelect))
  ) {
    const linkRow = await fetchOfficeUserLinkRow(uid).catch(() => null);
    if (!linkRow) {
      bootstrapError = BOOTSTRAP_ERRORS.OFFICE_LINK_BROKEN;
    } else if (!officeUser?.activo) {
      bootstrapError = BOOTSTRAP_ERRORS.OFFICE_INACTIVE;
    }
  }

  const admin = isSuperadminUser(uid, getSession()?.user?.email);

  return buildSessionCapabilities({
    account,
    shells,
    admin,
    activeMode: "conductor",
    officeUser,
    bootstrapError,
    mustChangePassword: profileMustChangePassword(profile),
    features: deriveFeatureFlags(account, "conductor", { isDemo, officeUser }),
  });
}

export function resolveActiveMode(capabilities, cachedMode = null) {
  if (capabilities?.admin) return "propietario";

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

  if (isSuperadminUser(uid, getSession()?.user?.email)) {
    const profiles = await sbSelect("profiles", `id=eq.${uid}`).catch(() => []);
    const profile = profiles[0] || null;
    const account = parseProfileAccount(profile);
    const capabilities = buildSessionCapabilities({
      account,
      shells: { conductor: false, empresa: false },
      admin: true,
      activeMode: "propietario",
      officeUser: null,
      bootstrapError: null,
      mustChangePassword: profileMustChangePassword(profile),
      features: {},
    });
    persistAuthSession({ uid, activeMode: "propietario", capabilities });
    return { capabilities, activeMode: "propietario", account, officeUser: null };
  }

  const profiles = await sbSelect("profiles", `id=eq.${uid}`).catch(() => []);
  const profile = profiles[0] || null;

  const officeUser = await fetchOfficeUserContext(uid);

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

  const capabilities = { ...base, features, mustChangePassword: !!base.mustChangePassword };

  persistAuthSession({ uid, activeMode, capabilities });

  return {
    capabilities,
    activeMode,
    account,
    officeUser: base.officeUser || null,
    mustChangePassword: !!base.mustChangePassword,
  };
}
