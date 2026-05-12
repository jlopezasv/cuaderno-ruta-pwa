const AUTH_CONTEXT_KEY = "cuaderno_auth_context_v1";

export function normalizeAuthContextKind(kind) {
  return kind === "empresa" ? "empresa" : "conductor";
}

export function contextKindFromProfileTipo(tipoCuenta) {
  return tipoCuenta === "empresa" ? "empresa" : "conductor";
}

export function getStoredAuthContext(uid = null) {
  try {
    const raw = localStorage.getItem(AUTH_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (uid && parsed.uid && parsed.uid !== uid) return null;
    return {
      uid: parsed.uid || uid || null,
      kind: normalizeAuthContextKind(parsed.kind),
      updated_at: parsed.updated_at || null,
    };
  } catch {
    return null;
  }
}

export function persistAuthContext(kind, uid) {
  if (!uid) return;
  try {
    localStorage.setItem(
      AUTH_CONTEXT_KEY,
      JSON.stringify({
        uid,
        kind: normalizeAuthContextKind(kind),
        updated_at: new Date().toISOString(),
      }),
    );
  } catch {}
}

export function clearAuthContext() {
  try {
    localStorage.removeItem(AUTH_CONTEXT_KEY);
  } catch {}
}
