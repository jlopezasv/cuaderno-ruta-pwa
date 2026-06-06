import { isDemoApp } from "../../config/appEnvironment.js";
import { buildOfficeUserRow } from "./empresaOfficeUsers.js";

export function buildOfficeUserCapabilities(row) {
  const built = buildOfficeUserRow(row);
  if (!built) return null;
  return {
    id: built.id,
    empresaId: built.empresaId,
    empresaNombre: row?.empresa_nombre || row?.empresaNombre || "",
    userId: built.userId,
    nombre: built.nombre,
    email: built.email,
    rol: built.rol,
    puedeVerTodos: built.puedeVerTodos,
    activo: built.activo,
  };
}

export async function resolveEmpresaIdForUser(uid, sbSelect, officeUser = null) {
  const emp = await resolveEmpresaRecordForUser(uid, sbSelect, officeUser);
  return emp?.id || null;
}

/**
 * Owner (empresas.owner_id) o usuario oficina activo en DEMO.
 * @returns {Promise<object|null>} fila empresas
 */
export async function resolveEmpresaRecordForUser(uid, sbSelect, officeUser = null) {
  if (!uid) return null;

  const ownerRows = await sbSelect("empresas", `owner_id=eq.${uid}`).catch(() => []);
  if (ownerRows[0]) return ownerRows[0];

  if (!isDemoApp()) return null;

  const link = officeUser?.empresaId
    ? { empresa_id: officeUser.empresaId }
    : (await sbSelect("empresa_usuarios", `user_id=eq.${uid}&activo=eq.true&limit=1`).catch(() => []))[0];

  const empresaId = link?.empresa_id;
  if (!empresaId) return null;

  const emps = await sbSelect("empresas", `id=eq.${empresaId}`).catch(() => []);
  return emps[0] || null;
}
