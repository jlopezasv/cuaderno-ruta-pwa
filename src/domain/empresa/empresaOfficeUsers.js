import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp, DEMO_LOGIN_HINT } from "../../config/appEnvironment.js";

export const OFFICE_USER_ROLES = Object.freeze(["jefe_flota", "trafico", "administrativo"]);

export const OFFICE_USER_ROLE_LABELS = Object.freeze({
  jefe_flota: "Jefe de flota",
  trafico: "Tráfico",
  administrativo: "Administrativo",
});

/** Roles elegibles como responsable de servicio. */
export const OFFICE_RESPONSABLE_ROLES = Object.freeze(["jefe_flota", "trafico"]);

export function normalizeOfficeUserRol(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return OFFICE_USER_ROLES.includes(key) ? key : "trafico";
}

export function officeUserRoleLabel(rol) {
  return OFFICE_USER_ROLE_LABELS[normalizeOfficeUserRol(rol)] || rol || "—";
}

export function buildOfficeUserRow(row) {
  if (!row) return null;
  const userId = row.user_id || row.userId;
  if (!userId) return null;
  return {
    id: row.id || null,
    empresaId: row.empresa_id || row.empresaId,
    userId,
    nombre: row.nombre || "",
    email: row.email || "",
    rol: normalizeOfficeUserRol(row.rol),
    puedeVerTodos: !!row.puede_ver_todos || !!row.puedeVerTodos,
    activo: row.activo !== false,
    createdAt: row.created_at || row.createdAt || null,
  };
}

const officeUsersCache = { empresaId: null, data: null, inflight: null };

export function invalidateEmpresaOfficeUsersCache(empresaId = null) {
  if (empresaId == null || officeUsersCache.empresaId === empresaId) {
    officeUsersCache.empresaId = null;
    officeUsersCache.data = null;
    officeUsersCache.inflight = null;
  }
}

function mergeOfficeUserLists(fresh, fallback = []) {
  const map = new Map();
  for (const u of fallback) {
    const k = u?.id || u?.userId;
    if (k) map.set(String(k), u);
  }
  for (const u of fresh) {
    const k = u?.id || u?.userId;
    if (k) map.set(String(k), u);
  }
  return [...map.values()];
}

/** PostgREST error body → campos legibles (DEMO diagnóstico). */
function extractSupabaseError(body, httpStatus) {
  if (!body || typeof body !== "object") {
    return {
      message: `HTTP ${httpStatus} al leer empresa_usuarios`,
      code: null,
      details: null,
      hint: null,
    };
  }
  return {
    message: body.message || null,
    code: body.code || null,
    details: body.details || null,
    hint: body.hint || null,
  };
}

function formatSupabaseError(err) {
  return [err?.message, err?.code, err?.details, err?.hint].filter(Boolean).join(" · ");
}

function sortOfficeUsersByCreatedAt(users) {
  return [...users].sort((a, b) => {
    const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
}

/** Query REST empresa_usuarios (mismo patrón que sbSelect: filtros en querystring, sin order). */
function buildEmpresaOfficeUsersListFilter(empresaId) {
  return `empresa_id=eq.${empresaId}&select=id,empresa_id,user_id,nombre,email,rol,puede_ver_todos,activo,created_at`;
}

/**
 * Lista usuarios oficina de la empresa (jefe_flota vía RLS eu_sel / eu_sel_peer_demo).
 * DEMO: devuelve { users, error, debug } para diagnóstico en UI.
 */
export async function fetchEmpresaOfficeUsers(_sbSelect, empresaId, { force = false } = {}) {
  const empty = { users: [], error: null, debug: null };
  if (!empresaId || !isDemoApp()) return empty;

  if (!force && officeUsersCache.empresaId === empresaId && officeUsersCache.data) {
    return { users: officeUsersCache.data, error: null, debug: { cached: true, empresaId } };
  }
  if (!force && officeUsersCache.empresaId === empresaId && officeUsersCache.inflight) {
    return officeUsersCache.inflight;
  }

  officeUsersCache.empresaId = empresaId;
  officeUsersCache.inflight = (async () => {
    const filter = buildEmpresaOfficeUsersListFilter(empresaId);
    const url = `/rest/v1/empresa_usuarios?${filter}`;
    const res = await sbFetch(url);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const rawRows = res.ok && Array.isArray(body) ? body : [];
    const built = sortOfficeUsersByCreatedAt(rawRows.map(buildOfficeUserRow).filter(Boolean));
    const dropped = rawRows.length - built.length;
    const supabaseError = !res.ok ? extractSupabaseError(body, res.status) : null;

    const debug = {
      empresaId,
      filter,
      httpStatus: res.status,
      rawCount: rawRows.length,
      builtCount: built.length,
      droppedWithoutUserId: dropped,
      supabaseError,
      supabaseBody: !res.ok ? body : null,
    };

    if (!res.ok) {
      const errMsg = formatSupabaseError(supabaseError) || `HTTP ${res.status} al leer empresa_usuarios`;
      if (isDemoApp()) console.warn("[DEMO officeUsers] GET falló", debug, body);
      return { users: [], error: errMsg, debug };
    }

    if (rawRows.length === 0) {
      const errMsg = `RLS/consulta OK pero 0 filas para empresa_id=${empresaId}`;
      if (isDemoApp()) console.warn("[DEMO officeUsers] lista vacía", debug);
      return { users: [], error: errMsg, debug };
    }

    if (built.length === 0 && rawRows.length > 0) {
      const errMsg = `${rawRows.length} fila(s) sin user_id válido (revisar empresa_usuarios.user_id)`;
      if (isDemoApp()) console.warn("[DEMO officeUsers] filas descartadas", debug);
      return { users: [], error: errMsg, debug };
    }

    if (built.length > 0) officeUsersCache.data = built;
    if (isDemoApp()) console.warn("[DEMO officeUsers] OK", debug);
    return { users: built, error: null, debug };
  })()
    .catch((e) => ({
      users: [],
      error: e?.message || String(e),
      debug: { empresaId, fetchError: true },
    }))
    .finally(() => {
      officeUsersCache.inflight = null;
    });

  return officeUsersCache.inflight;
}

/** empresaId efectivo: prop del layout o sesión officeUser. */
export function resolveEmpresaOfficeUsersTenantId(empresaIdProp, officeUser = null) {
  const fromOffice = officeUser?.empresaId || officeUser?.empresa_id || null;
  return empresaIdProp || fromOffice || null;
}

export { mergeOfficeUserLists };

export async function fetchActiveOfficeUserByUid(sbSelect, uid) {
  if (!uid || !isDemoApp()) return null;
  const rows = await sbSelect(
    "empresa_usuarios",
    `user_id=eq.${uid}&activo=eq.true&limit=1`,
  ).catch(() => []);
  return buildOfficeUserRow(rows[0] || null);
}

/** empresa_id del tenant para responsables: prioriza officeUser, no owner_id. */
export function resolveOfficeResponsablesEmpresaId(empresaId, officeUser = null) {
  const fromOffice = officeUser?.empresaId || officeUser?.empresa_id || null;
  return fromOffice || empresaId || null;
}

function logOfficeResponsablesDemo(phase, payload) {
  if (!isDemoApp()) return;
  console.warn("[DEMO officeResponsables]", phase, payload);
}

function officeUserAsResponsableCandidate(officeUser) {
  if (!officeUser?.activo || !officeUser?.userId) return null;
  const rol = normalizeOfficeUserRol(officeUser.rol);
  if (!OFFICE_RESPONSABLE_ROLES.includes(rol)) return null;
  return {
    id: officeUser.id ?? null,
    empresaId: officeUser.empresaId ?? officeUser.empresa_id ?? null,
    userId: officeUser.userId,
    nombre: officeUser.nombre || "",
    email: officeUser.email || "",
    rol,
    puedeVerTodos: !!officeUser.puedeVerTodos,
    activo: true,
  };
}

function mergeOfficeResponsablesWithSession(list, officeUser) {
  const out = Array.isArray(list) ? [...list] : [];
  const sessionRow = officeUserAsResponsableCandidate(officeUser);
  if (sessionRow && !out.some((u) => u.userId === sessionRow.userId)) {
    out.unshift(sessionRow);
  }
  return out.filter((u) => u.activo && OFFICE_RESPONSABLE_ROLES.includes(u.rol));
}

/**
 * Usuarios activos elegibles como responsable (jefe_flota + trafico).
 * Filtro en PostgREST: empresa_id, activo=true, rol in (jefe_flota, trafico).
 */
export async function fetchEmpresaOfficeResponsables(_sbSelect, empresaId, officeUser = null) {
  const tenantId = resolveOfficeResponsablesEmpresaId(empresaId, officeUser);
  if (!tenantId || !isDemoApp()) {
    logOfficeResponsablesDemo("skip", {
      empresaIdArg: empresaId ?? null,
      officeEmpresaId: officeUser?.empresaId ?? null,
    });
    return mergeOfficeResponsablesWithSession([], officeUser);
  }

  const filter = [
    `empresa_id=eq.${tenantId}`,
    "activo=eq.true",
    "rol=in.(jefe_flota,trafico)",
    "select=id,user_id,nombre,email,rol,activo,empresa_id",
    "order=nombre.asc",
  ].join("&");

  let rows = [];
  let fetchError = null;
  try {
    const res = await sbFetch(`/rest/v1/empresa_usuarios?${filter}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      fetchError = {
        status: res.status,
        message: body?.message || body?.hint || body?.details || res.statusText,
      };
    } else {
      rows = await res.json().catch(() => []);
    }
  } catch (e) {
    fetchError = { message: e?.message || String(e) };
  }

  const built = (Array.isArray(rows) ? rows : []).map(buildOfficeUserRow).filter(Boolean);
  const merged = mergeOfficeResponsablesWithSession(built, officeUser);

  logOfficeResponsablesDemo("loaded", {
    empresaId: tenantId,
    rawCount: Array.isArray(rows) ? rows.length : 0,
    responsablesCount: merged.length,
    roles: merged.map((u) => u.rol),
    error: fetchError,
  });

  return merged;
}

const responsablesCache = { empresaId: null, data: null, inflight: null };

export function invalidateEmpresaOfficeResponsablesCache(empresaId = null) {
  if (empresaId == null || responsablesCache.empresaId === empresaId) {
    responsablesCache.empresaId = null;
    responsablesCache.data = null;
    responsablesCache.inflight = null;
  }
}

export function buildOfficeResponsablesByUserId(users) {
  const map = {};
  for (const u of Array.isArray(users) ? users : []) {
    if (u?.userId) map[u.userId] = u;
  }
  return map;
}

export function officeResponsableDisplayName(userId, usersOrMap) {
  if (!userId) return null;
  const map = Array.isArray(usersOrMap)
    ? buildOfficeResponsablesByUserId(usersOrMap)
    : usersOrMap || {};
  const u = map[userId];
  return u?.nombre?.trim() || u?.email?.trim() || null;
}

/** Etiqueta de listado: «Responsable · Nombre» o «Sin responsable». */
export function officeResponsableServicioLine(servicio, usersOrMapOrResolver) {
  const uid = servicio?.responsable_user_id;
  if (!uid) return "Responsable · Sin responsable";
  const name =
    typeof usersOrMapOrResolver === "function"
      ? usersOrMapOrResolver(uid)
      : officeResponsableDisplayName(uid, usersOrMapOrResolver);
  return name ? `Responsable · ${name}` : "Responsable · Sin responsable";
}

/** Validación al crear servicio con responsable DEMO. */
export function validateOfficeResponsableOnCreate({ officeUser, responsableId, officeResponsables }) {
  if (!isDemoApp()) return null;
  if (!officeResponsables?.length) {
    return "No hay usuarios de oficina activos como responsable. Contacta con el jefe de flota.";
  }
  const rol = String(officeUser?.rol || "").toLowerCase();
  if (rol === "administrativo") return "No tienes permiso para crear servicios.";
  if (rol === "trafico" && !officeUser?.puedeVerTodos) {
    const uid = officeUser?.userId;
    if (!responsableId || responsableId !== uid) return "El responsable debe ser tu usuario de tráfico.";
    return null;
  }
  if (rol === "trafico" && officeUser?.puedeVerTodos && !responsableId) {
    return "Selecciona un responsable del servicio.";
  }
  return null;
}

/** Una sola consulta por empresa y sesión (reutilizada entre panel, dashboard y modales). */
export async function fetchEmpresaOfficeResponsablesCached(
  sbSelect,
  empresaId,
  officeUser = null,
  { force = false } = {},
) {
  const tenantId = resolveOfficeResponsablesEmpresaId(empresaId, officeUser);
  if (!tenantId || !isDemoApp()) return [];

  if (
    !force &&
    responsablesCache.empresaId === tenantId &&
    Array.isArray(responsablesCache.data) &&
    responsablesCache.data.length > 0
  ) {
    return responsablesCache.data;
  }
  if (!force && responsablesCache.empresaId === tenantId && responsablesCache.inflight) {
    return responsablesCache.inflight;
  }

  responsablesCache.empresaId = tenantId;
  responsablesCache.inflight = fetchEmpresaOfficeResponsables(sbSelect, tenantId, officeUser)
    .then((rows) => {
      responsablesCache.inflight = null;
      if (rows.length > 0) responsablesCache.data = rows;
      else responsablesCache.data = null;
      return rows;
    })
    .catch((err) => {
      responsablesCache.inflight = null;
      responsablesCache.data = null;
      logOfficeResponsablesDemo("cache_error", { empresaId: tenantId, message: err?.message });
      throw err;
    });
  return responsablesCache.inflight;
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

export async function createEmpresaOfficeUserDemo({ empresaId, nombre, email, rol, callerUid }) {
  if (!isDemoApp()) throw new Error("Solo disponible en entorno DEMO");
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
  if (!res.ok) throw new Error(data?.error || `Error al crear usuario (${res.status})`);
  return { ...data, demoPassword: data.password || DEMO_LOGIN_HINT.password };
}

export function canManageEmpresaOfficeUsers(capabilities) {
  if (!isDemoApp() || !capabilities?.empresa) return false;
  if (capabilities.accountType === "empresa") return true;
  return (
    normalizeOfficeUserRol(capabilities.officeUser?.rol) === "jefe_flota" &&
    capabilities.officeUser?.activo !== false
  );
}

/** Impide dejar la empresa sin ningún jefe_flota activo. */
export function validateJefeFlotaGuard(users, targetId, patch) {
  const list = Array.isArray(users) ? users : [];
  const target = list.find((u) => u.id === targetId);
  if (!target || target.rol !== "jefe_flota") return null;

  const wouldDeactivate = patch.activo === false;
  const wouldDemote = patch.rol != null && normalizeOfficeUserRol(patch.rol) !== "jefe_flota";
  if (!wouldDeactivate && !wouldDemote) return null;

  const otherActiveJefes = list.filter(
    (u) => u.id !== targetId && u.rol === "jefe_flota" && u.activo,
  );
  if (otherActiveJefes.length === 0) {
    return "Debe haber al menos un jefe de flota activo en la empresa.";
  }
  return null;
}
