import { isDemoApp } from "../config/appEnvironment.js";
import { sbFetch } from "../data/supabaseClient.js";
import { buildOfficeUserCapabilities } from "../domain/empresa/empresaOfficeContext.js";
import { fetchOfficeUserContextRest } from "../domain/empresa/officeUserLinkage.js";

/** RPC: contexto oficina del usuario autenticado (solo filas activas). */
export async function fetchOfficeUserContextRpc() {
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
    codigo_equipo: row.codigo_equipo,
    rol: row.rol,
    puede_ver_todos: row.puede_ver_todos,
    activo: row.activo,
  });
}

/** RPC primero; REST como fallback si la sesión no tiene contexto oficina. */
export async function fetchOfficeUserContext(uid = null) {
  const fromRpc = await fetchOfficeUserContextRpc();
  if (fromRpc?.activo && fromRpc.empresaId) return fromRpc;
  const fromRest = await fetchOfficeUserContextRest(uid);
  if (fromRest?.activo && fromRest.empresaId) return fromRest;
  return fromRpc || fromRest || null;
}

export const BOOTSTRAP_ERRORS = Object.freeze({
  NO_PROFILE: "NO_PROFILE",
  NO_EMPRESA_SHELL: "NO_EMPRESA_SHELL",
  OFFICE_INACTIVE: "OFFICE_INACTIVE",
  OFFICE_LINK_BROKEN: "OFFICE_LINK_BROKEN",
});

export function bootstrapErrorMessage(code) {
  switch (code) {
    case BOOTSTRAP_ERRORS.NO_PROFILE:
      return isDemoApp()
        ? "No se encontró tu perfil. Si el registro falló a medias, borra el usuario en Supabase Auth o regístrate con otro email."
        : "No se encontró tu perfil. Contacta con administración.";
    case BOOTSTRAP_ERRORS.NO_EMPRESA_SHELL:
      return "No tienes acceso al panel de empresa. Verifica tu cuenta de oficina.";
    case BOOTSTRAP_ERRORS.OFFICE_INACTIVE:
      return "Tu usuario de oficina está desactivado. Contacta con el jefe de flota.";
    case BOOTSTRAP_ERRORS.OFFICE_LINK_BROKEN:
      return "Tu cuenta de oficina no está vinculada correctamente a la empresa. Contacta con el jefe de flota o el administrador.";
    default:
      return "No se pudo iniciar la sesión de empresa.";
  }
}
