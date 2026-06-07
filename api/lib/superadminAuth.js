import { getSupabaseServerEnv } from "./supabaseEnv.js";

const DEFAULT_SUPERADMIN_UIDS = "4b63a6e5-2e02-44e7-af61-b169583f40f5";
const DEFAULT_SUPERADMIN_EMAIL = "jlopezasv@gmail.com";

export const SUPERADMIN_PANEL_USER_IDS = (
  process.env.ADMIN_PANEL_USER_IDS ||
  process.env.SUPERADMIN_USER_IDS ||
  DEFAULT_SUPERADMIN_UIDS
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const SUPERADMIN_EMAIL = (
  process.env.SUPERADMIN_EMAIL || DEFAULT_SUPERADMIN_EMAIL
).trim().toLowerCase();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sbServer() {
  return getSupabaseServerEnv();
}

export async function supabaseAuthUser(accessToken) {
  const res = await fetch(`${sbServer().url}/auth/v1/user`, {
    headers: {
      apikey: sbServer().anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) return null;
  return data;
}

export function isSuperadminIdentity({ uid, email }) {
  if (!uid || !UUID_RE.test(uid)) return false;
  if (!SUPERADMIN_PANEL_USER_IDS.includes(uid)) return false;
  const norm = String(email || "").trim().toLowerCase();
  return norm === SUPERADMIN_EMAIL;
}

/**
 * Verifica Bearer JWT + uid/email de superadmin.
 * @returns {{ ok: true, uid: string, email: string } | { ok: false, status: number, error: string, code: string }}
 */
export async function requireSuperadmin(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Falta Authorization: Bearer",
      code: "SUPERADMIN_UNAUTHORIZED",
    };
  }
  if (!sbServer().serviceRoleKey) {
    return {
      ok: false,
      status: 503,
      error: "Servidor sin service role key",
      code: "SUPERADMIN_MISCONFIGURED",
    };
  }

  const user = await supabaseAuthUser(token);
  if (!user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Sesión inválida o expirada",
      code: "SUPERADMIN_UNAUTHORIZED",
    };
  }

  const email = user.email || user.user_metadata?.email || "";
  if (!isSuperadminIdentity({ uid: user.id, email })) {
    return {
      ok: false,
      status: 403,
      error: "Acceso restringido al propietario de la plataforma",
      code: "SUPERADMIN_FORBIDDEN",
    };
  }

  return { ok: true, uid: user.id, email: String(email).trim().toLowerCase() };
}
