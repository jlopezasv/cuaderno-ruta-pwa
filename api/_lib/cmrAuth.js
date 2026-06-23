import { supabaseAuthUser } from "./superadminAuth.js";

/**
 * Verifica Bearer JWT de sesión Supabase.
 * @returns {{ ok: true, uid: string, email: string } | { ok: false, status: number, error: string, code: string }}
 */
export async function requireAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Falta Authorization: Bearer",
      code: "CMR_UNAUTHORIZED",
    };
  }

  const user = await supabaseAuthUser(token);
  if (!user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Sesión inválida o expirada",
      code: "CMR_UNAUTHORIZED",
    };
  }

  const email = user.email || user.user_metadata?.email || "";
  return { ok: true, uid: user.id, email: String(email).trim().toLowerCase() };
}
