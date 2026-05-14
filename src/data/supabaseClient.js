export const SB_URL = "https://glyexutcypmhkndvmcxd.supabase.co";
export const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseWV4dXRjeXBtaGtuZHZtY3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTg1MzQsImV4cCI6MjA5MTU3NDUzNH0.hYcNca-LxPz9KrTP65OFDp0WUiWx7fqR8uxYdl2ByLA";

let onSessionExpired = null;

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

export async function sbFetch(path, opts = {}) {
  const session = JSON.parse(localStorage.getItem("sb_session") || "null");
  const headers = {
    "Content-Type": "application/json",
    "apikey": SB_KEY,
    "Authorization": `Bearer ${session?.access_token || SB_KEY}`,
    ...opts.headers,
  };
  const res = await fetch(`${SB_URL}${path}`, { ...opts, headers });

  // Si el token ha caducado, intentar refrescar una vez
  if (res.status === 401 && session?.refresh_token) {
    try {
      const ref = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SB_KEY },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const rd = await ref.json();
      if (rd.access_token) {
        localStorage.setItem("sb_session", JSON.stringify(rd));
        // Reintentar la petición con el nuevo token
        const headers2 = { ...headers, "Authorization": `Bearer ${rd.access_token}` };
        return fetch(`${SB_URL}${path}`, { ...opts, headers: headers2 });
      }
    } catch(_) {}
    // Si no se puede refrescar, limpiar sesión y forzar login
    localStorage.removeItem("sb_session");
    if (onSessionExpired) onSessionExpired();
  }
  return res;
}

export function getSession() {
  return JSON.parse(localStorage.getItem("sb_session") || "null");
}

export function getUserId() {
  const s = getSession();
  return s?.user?.id || null;
}

/** JWT de sesión (para Authorization en APIs propias como /api/push). */
export function getAccessToken() {
  const s = getSession();
  return s?.access_token || null;
}

// Data sync — upsert batch
export async function sbUpsert(table, rows) {
  if (!rows.length) return;
  const res = await sbFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  return res;
}

export async function sbSelect(table, filter = "") {
  const res = await sbFetch(`/rest/v1/${table}?${filter}`);
  if (!res.ok) return [];
  return res.json();
}

export async function sbDelete(table, id) {
  await sbFetch(`/rest/v1/${table}?id=eq.${id}`, { method: "DELETE" });
}
