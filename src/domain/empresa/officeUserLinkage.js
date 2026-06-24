import { sbFetch, getAuthUid } from "../../data/supabaseClient.js";
import { buildOfficeUserCapabilities } from "./empresaOfficeContext.js";

/** Contexto oficina vía REST (fallback si RPC no devuelve fila). */
export async function fetchOfficeUserContextRest(uid = null) {
  const userId = uid || getAuthUid();
  if (!userId) return null;

  const res = await sbFetch(
    `/rest/v1/empresa_usuarios?user_id=eq.${encodeURIComponent(userId)}&select=id,empresa_id,user_id,nombre,email,rol,puede_ver_todos,activo,created_at&limit=1`,
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  const link = Array.isArray(rows) ? rows[0] : null;
  if (!link?.empresa_id || !link?.user_id) return null;

  let empresaNombre = "";
  let codigoEquipo = "";
  const empRes = await sbFetch(
    `/rest/v1/empresas?id=eq.${encodeURIComponent(link.empresa_id)}&select=nombre,codigo_equipo,codigo_corto&limit=1`,
  );
  if (empRes.ok) {
    const emps = await empRes.json().catch(() => []);
    const emp = Array.isArray(emps) ? emps[0] : null;
    empresaNombre = emp?.nombre || "";
    codigoEquipo = emp?.codigo_equipo || emp?.codigo_corto || "";
  }

  return buildOfficeUserCapabilities({
    ...link,
    empresa_nombre: empresaNombre,
    codigo_equipo: codigoEquipo,
  });
}

/** ¿Existe alguna fila empresa_usuarios para el usuario (activa o no)? */
export async function fetchOfficeUserLinkRow(uid = null) {
  const userId = uid || getAuthUid();
  if (!userId) return null;
  const res = await sbFetch(
    `/rest/v1/empresa_usuarios?user_id=eq.${encodeURIComponent(userId)}&select=id,empresa_id,user_id,activo,rol,email,nombre&limit=1`,
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

/** ¿El usuario es owner de alguna empresa? */
export async function userIsEmpresaOwner(uid, sbSelect) {
  if (!uid || !sbSelect) return false;
  const rows = await sbSelect("empresas", `owner_id=eq.${uid}&limit=1`).catch(() => []);
  return rows.length > 0;
}
