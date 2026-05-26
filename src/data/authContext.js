const AUTH_SESSION_KEY = "cuaderno_auth_session_v2";
const LEGACY_CONTEXT_KEY = "cuaderno_auth_context_v1";

export function normalizeActiveMode(mode) {
  return mode === "empresa" ? "empresa" : "conductor";
}

function normalizeCapabilities(caps = {}) {
  return {
    conductor: caps.conductor !== false,
    empresa: !!caps.empresa,
    admin: !!caps.admin,
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

export function switchActiveMode(uid, activeMode) {
  const session = getStoredAuthSession(uid);
  if (!session?.uid) return;
  persistAuthSession({
    uid: session.uid,
    activeMode,
    capabilities: session.capabilities || { conductor: true, empresa: false, admin: false },
  });
}

export function isHybridSession(session) {
  return !!session?.capabilities?.empresa && !!session?.capabilities?.conductor;
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

export function contextKindFromProfileTipo(tipoCuenta) {
  return tipoCuenta === "empresa" ? "empresa" : "conductor";
}

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
    },
  });
}
