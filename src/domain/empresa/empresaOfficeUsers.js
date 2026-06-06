import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp, DEMO_LOGIN_HINT } from "../../config/appEnvironment.js";

export const OFFICE_USER_ROLES = Object.freeze(["jefe_flota", "trafico", "administrativo"]);

export const OFFICE_USER_ROLE_LABELS = Object.freeze({
  jefe_flota: "Jefe de flota",
  trafico: "Tráfico",
  administrativo: "Administrativo",
});

/** Roles elegibles como responsable de servicio (UI futura). */
export const OFFICE_RESPONSABLE_ROLES = Object.freeze(["jefe_flota", "trafico"]);

export function normalizeOfficeUserRol(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return OFFICE_USER_ROLES.includes(key) ? key : "trafico";
}

export function officeUserRoleLabel(rol) {
  return OFFICE_USER_ROLE_LABELS[normalizeOfficeUserRol(rol)] || rol || "—";
}

export function buildOfficeUserRow(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    empresaId: row.empresa_id,
    userId: row.user_id,
    nombre: row.nombre || "",
    email: row.email || "",
    rol: normalizeOfficeUserRol(row.rol),
    puedeVerTodos: !!row.puede_ver_todos,
    activo: row.activo !== false,
    createdAt: row.created_at || null,
  };
}

export async function fetchEmpresaOfficeUsers(sbSelect, empresaId) {
  if (!empresaId || !isDemoApp()) return [];
  const rows = await sbSelect(
    "empresa_usuarios",
    `empresa_id=eq.${empresaId}&order=created_at.asc`,
  ).catch(() => []);
  return (Array.isArray(rows) ? rows : []).map(buildOfficeUserRow).filter(Boolean);
}

export async function fetchActiveOfficeUserByUid(sbSelect, uid) {
  if (!uid || !isDemoApp()) return null;
  const rows = await sbSelect(
    "empresa_usuarios",
    `user_id=eq.${uid}&activo=eq.true&limit=1`,
  ).catch(() => []);
  return buildOfficeUserRow(rows[0] || null);
}

/** Usuarios activos elegibles como responsable_user_id (jefe_flota + tráfico). */
export async function fetchEmpresaOfficeResponsables(sbSelect, empresaId) {
  const users = await fetchEmpresaOfficeUsers(sbSelect, empresaId);
  return users.filter(
    (u) => u.activo && OFFICE_RESPONSABLE_ROLES.includes(u.rol),
  );
}

export async function patchEmpresaOfficeUser(id, patch) {
  if (!id) throw new Error("Falta id de usuario oficina");
  const body = {};
  if (patch.rol != null) body.rol = normalizeOfficeUserRol(patch.rol);
  if (patch.activo != null) body.activo = !!patch.activo;
  if (patch.puede_ver_todos != null) body.puede_ver_todos = !!patch.puede_ver_todos;
  if (patch.nombre != null) body.nombre = String(patch.nombre).trim() || null;
  if (patch.email != null) body.email = String(patch.email).trim() || null;
  if (!Object.keys(body).length) return null;

  const res = await sbFetch(`/rest/v1/empresa_usuarios?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { Prefer: "return=representation" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `No se pudo actualizar (${res.status})`);
  }
  const data = await res.json();
  return buildOfficeUserRow(Array.isArray(data) ? data[0] : data);
}

export function updateEmpresaOfficeUserRol(id, rol) {
  return patchEmpresaOfficeUser(id, { rol });
}

export function setEmpresaOfficeUserActivo(id, activo) {
  return patchEmpresaOfficeUser(id, { activo: !!activo });
}

export function setEmpresaOfficeUserPuedeVerTodos(id, puedeVerTodos) {
  return patchEmpresaOfficeUser(id, { puede_ver_todos: !!puedeVerTodos });
}

export async function createEmpresaOfficeUserDemo({
  empresaId,
  nombre,
  email,
  rol,
  callerUid,
}) {
  if (!isDemoApp()) {
    throw new Error("Solo disponible en entorno DEMO");
  }
  if (!empresaId || !nombre?.trim() || !email?.trim()) {
    throw new Error("Empresa, nombre y email son obligatorios");
  }

  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_office_user_demo",
      caller_uid: callerUid,
      empresa_id: empresaId,
      nombre: nombre.trim(),
      email: email.trim(),
      rol: normalizeOfficeUserRol(rol),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Error al crear usuario (${res.status})`);
  }
  return {
    ...data,
    demoPassword: data.password || DEMO_LOGIN_HINT.password,
  };
}

export function canManageEmpresaOfficeUsers(capabilities) {
  if (!isDemoApp() || !capabilities?.empresa) return false;
  if (capabilities.accountType === "empresa") return true;
  return capabilities.officeUser?.rol === "jefe_flota" && capabilities.officeUser?.activo !== false;
}
