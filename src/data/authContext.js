import { deriveFeatureFlags, isHybridCapabilities, parseProfileAccount } from "../auth/accountModel.js";

const AUTH_SESSION_KEY = "cuaderno_auth_session_v2";
const LEGACY_CONTEXT_KEY = "cuaderno_auth_context_v1";

export function normalizeActiveMode(mode) {
  if (mode === "propietario") return "propietario";
  return mode === "empresa" ? "empresa" : "conductor";
}

function normalizeOfficeUser(raw) {
  if (!raw || typeof raw !== "object") return null;
  const empresaId = raw.empresaId || raw.empresa_id || null;
  if (!empresaId) return null;
  const codigoEquipo = String(raw.codigoEquipo || raw.codigo_equipo || "").trim();
  return {
    id: raw.id ?? null,
    empresaId,
    empresaNombre: raw.empresaNombre || raw.empresa_nombre || "",
    codigoEquipo: codigoEquipo || null,
    userId: raw.userId ?? raw.user_id ?? null,
    nombre: raw.nombre || "",
    email: raw.email || "",
    rol: raw.rol || "trafico",
    puedeVerTodos: !!raw.puedeVerTodos || !!raw.puede_ver_todos,
    activo: raw.activo !== false,
  };
}

function normalizeCapabilities(caps = {}) {
  const features =
    caps.features && typeof caps.features === "object" ? { ...caps.features } : {};
  return {
    conductor: caps.conductor === true,
    empresa: caps.empresa === true,
    admin: !!caps.admin,
    accountType: caps.accountType ?? null,
    empresaStatus: caps.empresaStatus ?? null,
    officeUser: normalizeOfficeUser(caps.officeUser),
    bootstrapError: caps.bootstrapError ?? null,
    features,
  };
}

function readLegacyContext(uid) {
  try {
    const raw = localStorage.getItem(LEGACY_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (uid && parsed.uid && parsed.uid !== uid) return null;
    return {
      uid: parsed.uid || uid || null,
      activeMode: normalizeActiveMode(parsed.kind),
      capabilities: null,
      updated_at: parsed.updated_at || null,
    };
  } catch {
    return null;
  }
}

export function getStoredAuthSession(uid = null) {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (uid && parsed.uid && parsed.uid !== uid) return null;
      return {
        uid: parsed.uid || uid || null,
        activeMode: normalizeActiveMode(parsed.activeMode),
        capabilities: normalizeCapabilities(parsed.capabilities),
        updated_at: parsed.updated_at || null,
      };
    }
    return readLegacyContext(uid);
  } catch {
    return readLegacyContext(uid);
  }
}

export function persistAuthSession({ uid, activeMode, capabilities }) {
  if (!uid) return;
  try {
    localStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({
        uid,
        activeMode: normalizeActiveMode(activeMode),
        capabilities: normalizeCapabilities(capabilities),
        updated_at: new Date().toISOString(),
      }),
    );
    localStorage.removeItem(LEGACY_CONTEXT_KEY);
  } catch {}
}

export function switchActiveMode(uid, activeMode, account = null) {
  const session = getStoredAuthSession(uid);
  if (!session?.uid) return;
  const caps = session.capabilities || {
    conductor: true,
    empresa: false,
    admin: false,
    features: {},
  };
  const acct =
    account ||
    (caps.accountType
      ? { accountType: caps.accountType, canDrive: false, empresaStatus: caps.empresaStatus }
      : null);
  const features = acct ? deriveFeatureFlags(acct, normalizeActiveMode(activeMode)) : caps.features;
  persistAuthSession({
    uid: session.uid,
    activeMode,
    capabilities: { ...caps, features },
  });
}

export function isHybridSession(session) {
  return isHybridCapabilities(session?.capabilities);
}

export function clearAuthContext() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(LEGACY_CONTEXT_KEY);
  } catch {}
}

/** @deprecated Use getStoredAuthSession */
export function getStoredAuthContext(uid = null) {
  const session = getStoredAuthSession(uid);
  if (!session) return null;
  return {
    uid: session.uid,
    kind: session.activeMode,
    activeMode: session.activeMode,
    capabilities: session.capabilities,
    updated_at: session.updated_at,
  };
}

export { contextKindFromAccountType as contextKindFromProfileTipo } from "../auth/accountModel.js";

/** @deprecated Use persistAuthSession / bootstrapAuthSession */
export function persistAuthContext(kind, uid) {
  const session = getStoredAuthSession(uid);
  persistAuthSession({
    uid,
    activeMode: normalizeActiveMode(kind),
    capabilities: session?.capabilities || {
      conductor: true,
      empresa: kind === "empresa",
      admin: false,
      features: {},
    },
  });
}
