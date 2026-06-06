import { isDemoApp } from "../config/appEnvironment.js";
import { sbFetch } from "../data/supabaseClient.js";
import { buildOfficeUserCapabilities } from "../domain/empresa/empresaOfficeContext.js";

/** Una sola llamada RPC: contexto oficina del usuario autenticado. */
export async function fetchOfficeUserContextRpc() {
  if (!isDemoApp()) return null;
  const res = await sbFetch("/rest/v1/rpc/get_current_office_user_context", {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.user_id || !row?.empresa_id) return null;
  return buildOfficeUserCapabilities({
    user_id: row.user_id,
    email: row.email,
    nombre: row.nombre,
    empresa_id: row.empresa_id,
    empresa_nombre: row.empresa_nombre,
    rol: row.rol,
    puede_ver_todos: row.puede_ver_todos,
    activo: row.activo,
  });
}

export const BOOTSTRAP_ERRORS = Object.freeze({
  NO_PROFILE: "NO_PROFILE",
  NO_EMPRESA_SHELL: "NO_EMPRESA_SHELL",
  OFFICE_INACTIVE: "OFFICE_INACTIVE",
});

export function bootstrapErrorMessage(code) {
  switch (code) {
    case BOOTSTRAP_ERRORS.NO_PROFILE:
      return "No se encontró tu perfil. Contacta con administración.";
    case BOOTSTRAP_ERRORS.NO_EMPRESA_SHELL:
      return "No tienes acceso al panel de empresa. Verifica tu cuenta de oficina.";
    case BOOTSTRAP_ERRORS.OFFICE_INACTIVE:
      return "Tu usuario de oficina está desactivado. Contacta con el jefe de flota.";
    default:
      return "No se pudo iniciar la sesión de empresa.";
  }
}
