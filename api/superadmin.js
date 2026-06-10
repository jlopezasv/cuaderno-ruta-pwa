// api/superadmin.js — Panel propietario (solo superadmin, service_role)

import { getSupabaseServerEnv } from "./_lib/supabaseEnv.js";
import { requireSuperadmin } from "./_lib/superadminAuth.js";
import {
  normalizeServicioAdminRow,
  stripServicioOperacionDisplay,
} from "./_lib/servicioDisplay.js";
import { buildPanelQuery } from "./_lib/panelQuery.js";

const OFFICE_USER_TEMP_PASSWORD = "DemoCuaderno2026!";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SERVICIO_ESTADOS_ACTIVOS = [
  "pendiente_asignacion",
  "asignado",
  "en_curso",
];
const SERVICIO_ESTADOS_COMPLETADOS = ["completado", "cerrado"];
const SERVICIO_ESTADOS_ANULADOS = ["anulado", "cancelado"];

function sbServer() {
  return getSupabaseServerEnv();
}

function srRestHeaders(json = true) {
  const h = {
    apikey: sbServer().serviceRoleKey,
    Authorization: `Bearer ${sbServer().serviceRoleKey}`,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function restSelect(pathWithQuery) {
  const r = await fetch(`${sbServer().url}/rest/v1/${pathWithQuery}`, {
    headers: { ...srRestHeaders(false), Accept: "application/json" },
  });
  if (!r.ok) return { ok: false, status: r.status, data: [] };
  const data = await r.json().catch(() => []);
  return { ok: true, data: Array.isArray(data) ? data : [] };
}

async function restCount(pathWithQuery) {
  const r = await fetch(`${sbServer().url}/rest/v1/${pathWithQuery}`, {
    headers: {
      ...srRestHeaders(false),
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!r.ok) return 0;
  const range = r.headers.get("content-range") || "";
  const m = range.match(/\/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

async function restPatch(pathWithQuery, body) {
  const r = await fetch(`${sbServer().url}/rest/v1/${pathWithQuery}`, {
    method: "PATCH",
    headers: { ...srRestHeaders(true), Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data, detail: data };
}

async function restInsert(table, body) {
  const r = await fetch(`${sbServer().url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...srRestHeaders(true), Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data, detail: data };
}

async function restUpsert(table, body) {
  const r = await fetch(`${sbServer().url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...srRestHeaders(true),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data, detail: data };
}

async function authAdminGetUserByEmail(email) {
  const filter = encodeURIComponent(`email.eq.${email}`);
  const r = await fetch(
    `${sbServer().url}/auth/v1/admin/users?page=1&per_page=1&filter=${filter}`,
    { headers: srRestHeaders(false) },
  );
  const data = await r.json().catch(() => ({}));
  const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
  return users[0] || null;
}

async function authAdminCreateUser({ email, password, nombre }) {
  const r = await fetch(`${sbServer().url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...srRestHeaders(true), Prefer: "return=representation" },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: nombre || "" },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, status: r.status, error: data?.msg || data?.message || "Auth create failed" };
  }
  return { ok: true, user: data };
}

async function authAdminSetUserPassword(userId, password) {
  const r = await fetch(
    `${sbServer().url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: srRestHeaders(true),
      body: JSON.stringify({ password }),
    },
  );
  return r.ok;
}

async function resolveAuthAccount({ email, nombre }) {
  const existing = await authAdminGetUserByEmail(email);
  if (existing?.id && UUID_RE.test(existing.id)) {
    await authAdminSetUserPassword(existing.id, OFFICE_USER_TEMP_PASSWORD);
    return {
      ok: true,
      userId: existing.id,
      authCreated: false,
      tempPassword: OFFICE_USER_TEMP_PASSWORD,
    };
  }
  const created = await authAdminCreateUser({
    email,
    password: OFFICE_USER_TEMP_PASSWORD,
    nombre,
  });
  if (!created.ok) {
    return { ok: false, error: created.error || "No se pudo crear el usuario en Auth" };
  }
  const uid = created.user?.id;
  if (!uid || !UUID_RE.test(uid)) {
    return { ok: false, error: "Auth no devolvió user id" };
  }
  return {
    ok: true,
    userId: uid,
    authCreated: true,
    tempPassword: OFFICE_USER_TEMP_PASSWORD,
  };
}

function monthStartIso() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function thirtyDaysAgoIso() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function prodEmpresaFilter() {
  return "is_test=eq.false";
}

async function authAdminGetUser(userId) {
  const r = await fetch(
    `${sbServer().url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { headers: srRestHeaders(false) },
  );
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

async function enrichServiciosWithConductores(servicios, empNameMap = new Map()) {
  if (!servicios?.length) return [];
  const servIds = servicios.map((s) => s.id).filter(Boolean);
  const condIdSet = new Set(servicios.map((s) => s.conductor_id).filter(Boolean));

  let assignRows = [];
  if (servIds.length) {
    const ar = await restSelect(
      `servicio_asignaciones?servicio_id=in.(${servIds.join(",")})&select=servicio_id,conductor_id,tipo_asignacion`,
    );
    assignRows = ar.data || [];
    for (const a of assignRows) {
      if (a.conductor_id) condIdSet.add(a.conductor_id);
    }
  }

  const condIds = [...condIdSet];
  const profMap = new Map();
  if (condIds.length) {
    const pr = await restSelect(
      `profiles?id=in.(${condIds.join(",")})&select=id,nombre,is_archived`,
    );
    for (const p of pr.data || []) {
      if (!p.is_archived) profMap.set(p.id, p.nombre || "Conductor");
    }
  }

  const assignsByServ = new Map();
  for (const a of assignRows) {
    if (!assignsByServ.has(a.servicio_id)) assignsByServ.set(a.servicio_id, []);
    assignsByServ.get(a.servicio_id).push({
      id: a.conductor_id,
      nombre: profMap.get(a.conductor_id) || "Conductor",
      tipo: a.tipo_asignacion,
    });
  }

  return servicios.map((s) => {
    const list = [...(assignsByServ.get(s.id) || [])];
    if (s.conductor_id && !list.some((c) => c.id === s.conductor_id)) {
      list.unshift({
        id: s.conductor_id,
        nombre: profMap.get(s.conductor_id) || "Conductor",
        tipo: "principal",
      });
    }
    return normalizeServicioAdminRow(s, {
      empresaNombre: empNameMap.get(s.empresa_id) || "—",
      conductores: list,
      conductorPrincipal: profMap.get(s.conductor_id) || list[0]?.nombre || null,
    });
  });
}

async function loadArchivedProfileIds() {
  const { data } = await restSelect("profiles?is_archived=eq.true&select=id");
  return new Set((data || []).map((p) => p.id));
}

async function handleDashboard() {
  const prod = prodEmpresaFilter();
  const monthStart = monthStartIso();
  const since30 = thirtyDaysAgoIso();

  const [
    empresasActivas,
    conductoresActivos,
    officeActivos,
    serviciosActivos,
    serviciosMes,
    docsExtra,
    empresasTotal,
    serviciosRecientes,
  ] = await Promise.all([
    restCount(`empresas?${prod}&activa=eq.true`),
    restCount("conductor_empresa?activo=eq.true"),
    restCount("empresa_usuarios?activo=eq.true"),
    restCount(
      `servicios?estado=in.(${SERVICIO_ESTADOS_ACTIVOS.join(",")})&empresa_id=not.is.null`,
    ),
    restCount(`servicios?created_at=gte.${monthStart}&empresa_id=not.is.null`),
    restCount("servicio_documentos_extra?select=id"),
    restCount(`empresas?${prod}`),
    restSelect(
      `servicios?select=empresa_id,created_at&empresa_id=not.is.null&order=created_at.desc&limit=500`,
    ),
  ]);

  const archived = await loadArchivedProfileIds();
  const { data: ceRows } = await restSelect("conductor_empresa?activo=eq.true&select=user_id");
  const conductoresNoArchivados = (ceRows || []).filter(
    (r) => r.user_id && !archived.has(r.user_id),
  ).length;

  const { data: emps } = await restSelect(`empresas?${prod}&select=id`);
  const empIds = new Set((emps || []).map((e) => e.id));
  const lastByEmpresa = new Map();
  for (const s of serviciosRecientes.data || []) {
    if (!s.empresa_id || !empIds.has(s.empresa_id)) continue;
    if (!lastByEmpresa.has(s.empresa_id)) {
      lastByEmpresa.set(s.empresa_id, s.created_at);
    }
  }

  let empresasSinActividad = 0;
  const sinActividadIds = [];
  for (const id of empIds) {
    const last = lastByEmpresa.get(id);
    if (!last || last < since30) {
      empresasSinActividad += 1;
      sinActividadIds.push(id);
    }
  }

  const { data: empresasRows } = await restSelect(
    `empresas?${prod}&select=id,nombre,activa,created_at,codigo_equipo,codigo_corto&order=created_at.desc`,
  );
  const empNameMap = new Map((empresasRows || []).map((e) => [e.id, e.nombre]));

  const ultimasEmpresas = (empresasRows || []).slice(0, 6).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    activa: e.activa !== false,
    codigoEquipo: e.codigo_equipo || e.codigo_corto || null,
    createdAt: e.created_at,
  }));

  const { data: recentServRows } = await restSelect(
    `servicios?select=id,referencia,estado,empresa_id,conductor_id,origen,destino,created_at,updated_at&empresa_id=not.is.null&order=created_at.desc&limit=12`,
  );
  const ultimosServicios = await enrichServiciosWithConductores(
    recentServRows || [],
    empNameMap,
  );

  const { data: servs30 } = await restSelect(
    `servicios?select=empresa_id&created_at=gte.${since30}&empresa_id=not.is.null`,
  );
  const act30 = new Map();
  for (const s of servs30 || []) {
    if (!s.empresa_id || !empIds.has(s.empresa_id)) continue;
    act30.set(s.empresa_id, (act30.get(s.empresa_id) || 0) + 1);
  }
  const empresasMasActividad = [...act30.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, count]) => ({
      id,
      nombre: empNameMap.get(id) || "—",
      servicios30d: count,
    }));

  const empresasSinActividadLista = sinActividadIds
    .map((id) => {
      const row = (empresasRows || []).find((e) => e.id === id);
      return {
        id,
        nombre: row?.nombre || empNameMap.get(id) || "—",
        ultimoServicio: lastByEmpresa.get(id) || null,
        activa: row?.activa !== false,
      };
    })
    .slice(0, 8);

  return {
    ok: true,
    stats: {
      empresasActivas,
      empresasTotal,
      conductoresActivos: conductoresNoArchivados || conductoresActivos,
      usuariosOficinaActivos: officeActivos,
      serviciosActivos,
      serviciosMes,
      documentosSubidos: docsExtra,
      empresasSinActividad,
    },
    ultimasEmpresas,
    ultimosServicios,
    empresasMasActividad,
    empresasSinActividadLista,
  };
}

async function handleListEmpresas() {
  const prod = prodEmpresaFilter();
  const { data: empresas, ok } = await restSelect(
    `empresas?${prod}&select=id,nombre,cif,codigo_equipo,codigo_corto,activa,created_at,owner_id&order=created_at.desc`,
  );
  if (!ok) return { ok: false, status: 502, error: "No se pudo leer empresas" };

  const ids = (empresas || []).map((e) => e.id);
  if (!ids.length) return { ok: true, empresas: [] };

  const monthStart = monthStartIso();
  const [ceAll, euAll, servAll, servMesAll] = await Promise.all([
    restSelect("conductor_empresa?select=empresa_id,user_id,activo"),
    restSelect("empresa_usuarios?select=empresa_id,activo"),
    restSelect(
      "servicios?select=empresa_id,created_at&empresa_id=not.is.null&order=created_at.desc&limit=2000",
    ),
    restSelect(
      `servicios?select=empresa_id&created_at=gte.${monthStart}&empresa_id=not.is.null`,
    ),
  ]);

  const archived = await loadArchivedProfileIds();
  const condByEmp = new Map();
  const officeByEmp = new Map();
  const servCountByEmp = new Map();
  const servMesByEmp = new Map();
  const lastServByEmp = new Map();

  for (const c of ceAll.data || []) {
    if (!c.empresa_id || !c.activo || archived.has(c.user_id)) continue;
    condByEmp.set(c.empresa_id, (condByEmp.get(c.empresa_id) || 0) + 1);
  }
  for (const u of euAll.data || []) {
    if (!u.empresa_id || !u.activo) continue;
    officeByEmp.set(u.empresa_id, (officeByEmp.get(u.empresa_id) || 0) + 1);
  }
  for (const s of servAll.data || []) {
    if (!s.empresa_id) continue;
    servCountByEmp.set(s.empresa_id, (servCountByEmp.get(s.empresa_id) || 0) + 1);
    if (!lastServByEmp.has(s.empresa_id)) {
      lastServByEmp.set(s.empresa_id, s.created_at);
    }
  }
  for (const s of servMesAll.data || []) {
    if (!s.empresa_id) continue;
    servMesByEmp.set(s.empresa_id, (servMesByEmp.get(s.empresa_id) || 0) + 1);
  }

  const list = (empresas || []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    cif: e.cif || null,
    codigoEquipo: e.codigo_equipo || e.codigo_corto || null,
    activa: e.activa !== false,
    createdAt: e.created_at,
    conductores: condByEmp.get(e.id) || 0,
    usuariosOficina: officeByEmp.get(e.id) || 0,
    servicios: servCountByEmp.get(e.id) || 0,
    serviciosMes: servMesByEmp.get(e.id) || 0,
    ultimoServicio: lastServByEmp.get(e.id) || null,
  }));

  return { ok: true, empresas: list };
}

async function handleListUsuarios() {
  const { data: empresas } = await restSelect(
    `empresas?${prodEmpresaFilter()}&select=id,nombre`,
  );
  const empMap = new Map((empresas || []).map((e) => [e.id, e.nombre]));

  const [office, conductores] = await Promise.all([
    restSelect(
      "empresa_usuarios?select=id,user_id,nombre,email,rol,activo,empresa_id,created_at&order=created_at.desc&limit=150",
    ),
    restSelect(
      "conductor_empresa?select=id,user_id,nombre,matricula,activo,empresa_id,created_at&order=created_at.desc&limit=150",
    ),
  ]);

  const usuariosOficina = (office.data || []).map((u) => ({
    id: u.id,
    userId: u.user_id,
    nombre: u.nombre || "—",
    email: u.email || null,
    rol: u.rol,
    activo: u.activo !== false,
    empresaId: u.empresa_id,
    empresaNombre: empMap.get(u.empresa_id) || "—",
    tipo: "oficina",
    createdAt: u.created_at,
  }));

  const usuariosConductor = (conductores.data || []).map((c) => ({
    id: c.id,
    userId: c.user_id,
    nombre: c.nombre || "—",
    matricula: c.matricula || null,
    activo: c.activo !== false,
    empresaId: c.empresa_id,
    empresaNombre: empMap.get(c.empresa_id) || "—",
    tipo: "conductor",
    createdAt: c.created_at,
  }));

  return {
    ok: true,
    usuarios: [...usuariosOficina, ...usuariosConductor].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    ),
  };
}

async function handleListServicios() {
  const { data: empresas } = await restSelect(
    `empresas?${prodEmpresaFilter()}&select=id,nombre`,
  );
  const empMap = new Map((empresas || []).map((e) => [e.id, e.nombre]));

  const { data: servs } = await restSelect(
    "servicios?select=id,referencia,estado,origen,destino,empresa_id,conductor_id,created_at,updated_at&empresa_id=not.is.null&order=created_at.desc&limit=80",
  );

  return {
    ok: true,
    servicios: await enrichServiciosWithConductores(servs || [], empMap),
  };
}

async function handleListDocumentos() {
  const { data: empresas } = await restSelect(
    `empresas?${prodEmpresaFilter()}&select=id,nombre`,
  );
  const empMap = new Map((empresas || []).map((e) => [e.id, e.nombre]));

  const { data: docs } = await restSelect(
    "servicio_documentos_extra?select=id,tipo,archivo_nombre,empresa_id,created_at&order=created_at.desc&limit=80",
  );

  return {
    ok: true,
    documentos: (docs || []).map((d) => ({
      id: d.id,
      tipo: d.tipo,
      nombre: d.archivo_nombre || d.tipo || "Documento",
      empresaId: d.empresa_id,
      empresaNombre: empMap.get(d.empresa_id) || "—",
      createdAt: d.created_at,
    })),
  };
}

async function handleEmpresaDetail(empresaId) {
  if (!empresaId || !UUID_RE.test(empresaId)) {
    return { ok: false, status: 400, error: "empresa_id inválido" };
  }

  const { data: emps } = await restSelect(
    `empresas?id=eq.${encodeURIComponent(empresaId)}&select=*`,
  );
  const empresa = emps[0];
  if (!empresa) return { ok: false, status: 404, error: "Empresa no encontrada" };

  const ownerId = empresa.owner_id;
  const [ownerProf, ceRows, euRows, servicios, docsExtra, docsCount, subs] = await Promise.all([
    restSelect(`profiles?id=eq.${encodeURIComponent(ownerId)}&select=*`),
    restSelect(
      `conductor_empresa?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,user_id,nombre,matricula,activo,created_at&order=created_at.desc`,
    ),
    restSelect(
      `empresa_usuarios?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,user_id,nombre,email,rol,puede_ver_todos,activo,created_at&order=created_at.desc`,
    ),
    restSelect(
      `servicios?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,estado,referencia,origen,destino,conductor_id,empresa_id,created_at,updated_at&order=created_at.desc&limit=30`,
    ),
    restSelect(
      `servicio_documentos_extra?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,tipo,archivo_nombre,created_at&order=created_at.desc&limit=15`,
    ),
    restCount(
      `servicio_documentos_extra?empresa_id=eq.${encodeURIComponent(empresaId)}`,
    ),
    restSelect(
      `subscriptions?user_id=eq.${encodeURIComponent(String(ownerId))}&select=plan,status,current_period_end,stripe_customer_id&limit=1`,
    ),
  ]);

  const owner = ownerProf.data?.[0] || null;
  const condUserIds = [...new Set((ceRows.data || []).map((c) => c.user_id).filter(Boolean))];
  let condProfiles = [];
  if (condUserIds.length) {
    const { data } = await restSelect(
      `profiles?id=in.(${condUserIds.join(",")})&select=id,nombre,telefono,is_archived`,
    );
    condProfiles = data || [];
  }
  const profMap = new Map(condProfiles.map((p) => [p.id, p]));

  const conductores = (ceRows.data || []).map((c) => {
    const p = profMap.get(c.user_id);
    return {
      id: c.id,
      userId: c.user_id,
      nombre: p?.nombre || c.nombre || "—",
      email: null,
      telefono: p?.telefono || null,
      matricula: c.matricula || null,
      activo: c.activo !== false && !p?.is_archived,
      createdAt: c.created_at,
    };
  });

  const officeUsers = (euRows.data || []).map((u) => ({
    id: u.id,
    userId: u.user_id,
    nombre: u.nombre || "—",
    email: u.email || null,
    rol: u.rol,
    puedeVerTodos: !!u.puede_ver_todos,
    activo: u.activo !== false,
    createdAt: u.created_at,
  }));

  const servs = servicios.data || [];
  const servicioStats = {
    activos: servs.filter((s) => SERVICIO_ESTADOS_ACTIVOS.includes(s.estado)).length,
    completados: servs.filter((s) => SERVICIO_ESTADOS_COMPLETADOS.includes(s.estado)).length,
    anulados: servs.filter((s) => SERVICIO_ESTADOS_ANULADOS.includes(s.estado)).length,
    total: servs.length,
  };

  const subscription = subs.data?.[0]
    ? {
        plan: subs.data[0].plan,
        status: subs.data[0].status,
        currentPeriodEnd: subs.data[0].current_period_end,
      }
    : null;

  return {
    ok: true,
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      cif: empresa.cif || null,
      codigoEquipo: empresa.codigo_equipo || empresa.codigo_corto || null,
      activa: empresa.activa !== false,
      createdAt: empresa.created_at,
      telefono: owner?.telefono || null,
      email: owner?.email_empresa || null,
      direccion: owner?.direccion || null,
      ciudad: owner?.ciudad || null,
      cp: owner?.cp || null,
      ownerId,
      subscription,
    },
    conductores,
    officeUsers,
    servicios: {
      stats: servicioStats,
      recientes: await enrichServiciosWithConductores(
        servs.slice(0, 15),
        new Map([[empresa.id, empresa.nombre]]),
      ),
    },
    documentos: {
      cantidad: docsCount,
      recientes: (docsExtra.data || []).map((d) => ({
        id: d.id,
        tipo: d.tipo,
        nombre: d.archivo_nombre,
        createdAt: d.created_at,
      })),
    },
  };
}

async function handleCreateEmpresa(body) {
  const nombre = String(body.nombre || "").trim();
  const cif = String(body.cif || "").trim() || null;
  const telefono = String(body.telefono || "").trim() || null;
  const email = String(body.email || "").trim().toLowerCase();
  const direccion = String(body.direccion || "").trim() || null;
  const ciudad = String(body.ciudad || "").trim() || null;
  const cp = String(body.cp || body.codigo_postal || "").trim() || null;
  const jefeNombre = String(body.jefe_nombre || body.jefeNombre || `Jefe de ${nombre}`).trim();

  if (!nombre || !email) {
    return { ok: false, status: 400, error: "Nombre de empresa y email del jefe son obligatorios" };
  }

  const authResolved = await resolveAuthAccount({ email, nombre: jefeNombre });
  if (!authResolved.ok) {
    return { ok: false, status: 502, error: authResolved.error || "Error al crear usuario Auth" };
  }

  const uid = authResolved.userId;
  const profRes = await restUpsert("profiles", {
    id: uid,
    nombre: jefeNombre,
    tipo_cuenta: "empresa",
    can_drive: false,
    cif,
    telefono,
    email_empresa: email,
    direccion,
    ciudad,
    cp,
    empresa: nombre,
  });
  if (!profRes.ok) {
    return {
      ok: false,
      status: 502,
      error: profRes.detail?.message || "No se pudo crear el perfil del jefe",
    };
  }

  const empRes = await restInsert("empresas", {
    nombre,
    cif,
    owner_id: uid,
    activa: true,
    is_test: false,
  });
  if (!empRes.ok) {
    return {
      ok: false,
      status: 502,
      error: empRes.detail?.message || "No se pudo crear la empresa",
    };
  }
  const empRow = Array.isArray(empRes.data) ? empRes.data[0] : empRes.data;

  const euRes = await restUpsert("empresa_usuarios", {
    empresa_id: empRow.id,
    user_id: uid,
    nombre: jefeNombre,
    email,
    rol: "jefe_flota",
    activo: true,
    puede_ver_todos: true,
  });
  if (!euRes.ok) {
    return {
      ok: false,
      status: 502,
      error: euRes.detail?.message || "No se pudo vincular jefe_flota",
    };
  }

  return {
    ok: true,
    empresa: {
      id: empRow.id,
      nombre: empRow.nombre,
      cif: empRow.cif,
      codigoEquipo: empRow.codigo_equipo || empRow.codigo_corto,
      activa: empRow.activa !== false,
    },
    jefeFlota: {
      userId: uid,
      email,
      nombre: jefeNombre,
      password: authResolved.tempPassword,
    },
    message: `Empresa creada. Código: ${empRow.codigo_equipo || empRow.codigo_corto}. Contraseña temporal: ${authResolved.tempPassword}`,
  };
}

async function handleToggleEmpresa(empresaId, activa) {
  if (!empresaId || !UUID_RE.test(empresaId)) {
    return { ok: false, status: 400, error: "empresa_id inválido" };
  }
  const patch = await restPatch(
    `empresas?id=eq.${encodeURIComponent(empresaId)}`,
    { activa: !!activa },
  );
  if (!patch.ok) {
    return { ok: false, status: 502, error: "No se pudo actualizar la empresa" };
  }
  const row = Array.isArray(patch.data) ? patch.data[0] : patch.data;
  return { ok: true, empresa: { id: row?.id, activa: row?.activa !== false } };
}

async function handleToggleConductor(conductorEmpresaId, activo) {
  if (!conductorEmpresaId || !UUID_RE.test(conductorEmpresaId)) {
    return { ok: false, status: 400, error: "conductor_empresa_id inválido" };
  }
  const patch = await restPatch(
    `conductor_empresa?id=eq.${encodeURIComponent(conductorEmpresaId)}`,
    { activo: !!activo },
  );
  if (!patch.ok) {
    return { ok: false, status: 502, error: "No se pudo actualizar el conductor" };
  }
  return { ok: true, activo: !!activo };
}

async function handleToggleOfficeUser(officeUserId, activo) {
  if (!officeUserId || !UUID_RE.test(officeUserId)) {
    return { ok: false, status: 400, error: "empresa_usuario_id inválido" };
  }
  const patch = await restPatch(
    `empresa_usuarios?id=eq.${encodeURIComponent(officeUserId)}`,
    { activo: !!activo },
  );
  if (!patch.ok) {
    return { ok: false, status: 502, error: "No se pudo actualizar el usuario de oficina" };
  }
  return { ok: true, activo: !!activo };
}

async function handleSupportSearch(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return { ok: true, results: [] };
  }
  const ql = q.toLowerCase();
  const qu = q.toUpperCase();
  const results = [];
  const seen = new Set();

  function push(item) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  }

  if (UUID_RE.test(q)) {
    const [emp, prof, svc] = await Promise.all([
      restSelect(`empresas?id=eq.${encodeURIComponent(q)}&select=id,nombre,codigo_equipo,codigo_corto`),
      restSelect(`profiles?id=eq.${encodeURIComponent(q)}&select=id,nombre,tipo_cuenta`),
      restSelect(`servicios?id=eq.${encodeURIComponent(q)}&select=id,referencia,estado,empresa_id`),
    ]);
    if (emp.data?.[0]) {
      push({
        type: "empresa",
        id: emp.data[0].id,
        label: emp.data[0].nombre,
        sublabel: emp.data[0].codigo_equipo || emp.data[0].codigo_corto || "Empresa",
      });
    }
    if (prof.data?.[0]) {
      push({
        type: "usuario",
        id: prof.data[0].id,
        label: prof.data[0].nombre || "Usuario",
        sublabel: prof.data[0].tipo_cuenta || "perfil",
      });
    }
    if (svc.data?.[0]) {
      const s = svc.data[0];
      push({
        type: "servicio",
        id: s.id,
        label: normalizeServicioAdminRow(s).refServicio,
        sublabel: s.estado,
      });
    }
  }

  const { data: emps } = await restSelect(
    `empresas?${prodEmpresaFilter()}&select=id,nombre,codigo_equipo,codigo_corto,cif&order=nombre.asc&limit=200`,
  );
  for (const e of emps || []) {
    const code = (e.codigo_equipo || e.codigo_corto || "").toUpperCase();
    const match =
      String(e.nombre || "").toLowerCase().includes(ql) ||
      String(e.cif || "").toLowerCase().includes(ql) ||
      (code && (code.includes(qu) || qu.includes(code)));
    if (match) {
      push({ type: "empresa", id: e.id, label: e.nombre, sublabel: code || "Empresa" });
    }
  }

  const { data: office } = await restSelect(
    `empresa_usuarios?select=id,user_id,nombre,email,empresa_id&limit=200`,
  );
  const empMap = new Map((emps || []).map((e) => [e.id, e.nombre]));
  for (const u of office || []) {
    if (
      String(u.email || "").toLowerCase().includes(ql) ||
      String(u.nombre || "").toLowerCase().includes(ql)
    ) {
      push({
        type: "usuario",
        id: u.user_id,
        label: u.nombre || u.email,
        sublabel: `Oficina · ${empMap.get(u.empresa_id) || "—"}`,
      });
    }
  }

  const { data: ce } = await restSelect(
    `conductor_empresa?select=id,user_id,nombre,matricula,empresa_id&limit=200`,
  );
  for (const c of ce || []) {
    if (
      String(c.nombre || "").toLowerCase().includes(ql) ||
      String(c.matricula || "").toLowerCase().includes(ql)
    ) {
      push({
        type: "usuario",
        id: c.user_id,
        label: c.nombre || c.matricula || "Conductor",
        sublabel: `Conductor · ${empMap.get(c.empresa_id) || "—"}`,
      });
    }
  }

  const { data: servs } = await restSelect(
    "servicios?select=id,referencia,estado,empresa_id&order=created_at.desc&limit=120",
  );
  for (const s of servs || []) {
    const ref = stripServicioOperacionDisplay(s.referencia).toLowerCase();
    const norm = normalizeServicioAdminRow(s, { empresaNombre: empMap.get(s.empresa_id) });
    if (ref.includes(ql) || norm.refServicio.toLowerCase().includes(ql)) {
      push({
        type: "servicio",
        id: s.id,
        label: norm.refServicio,
        sublabel: `${norm.estado} · ${empMap.get(s.empresa_id) || "—"}`,
      });
    }
  }

  return { ok: true, results: results.slice(0, 25) };
}

async function handleSupportUserDetail(userId) {
  if (!userId || !UUID_RE.test(userId)) {
    return { ok: false, status: 400, error: "user_id inválido" };
  }

  const [profRows, authUser, ceRows, euRows, servRows] = await Promise.all([
    restSelect(`profiles?id=eq.${encodeURIComponent(userId)}&select=*`),
    authAdminGetUser(userId),
    restSelect(
      `conductor_empresa?user_id=eq.${encodeURIComponent(userId)}&select=id,empresa_id,nombre,matricula,activo,created_at`,
    ),
    restSelect(
      `empresa_usuarios?user_id=eq.${encodeURIComponent(userId)}&select=id,empresa_id,nombre,email,rol,puede_ver_todos,activo,created_at`,
    ),
    restSelect(
      `servicios?conductor_id=eq.${encodeURIComponent(userId)}&select=id,estado,referencia,created_at&order=created_at.desc&limit=10`,
    ),
  ]);

  const profile = profRows.data?.[0] || null;
  const empresaIds = [
    ...new Set([
      ...(ceRows.data || []).map((r) => r.empresa_id),
      ...(euRows.data || []).map((r) => r.empresa_id),
    ].filter(Boolean)),
  ];
  let empMap = new Map();
  if (empresaIds.length) {
    const er = await restSelect(
      `empresas?id=in.(${empresaIds.join(",")})&select=id,nombre,codigo_equipo,codigo_corto`,
    );
    empMap = new Map((er.data || []).map((e) => [e.id, e]));
  }

  const office = (euRows.data || [])[0] || null;
  const conductoresVinculos = (ceRows.data || []).map((c) => ({
    id: c.id,
    empresaId: c.empresa_id,
    empresaNombre: empMap.get(c.empresa_id)?.nombre || "—",
    nombre: c.nombre,
    matricula: c.matricula,
    activo: c.activo !== false,
  }));

  const serviciosAsignados = await enrichServiciosWithConductores(
    servRows.data || [],
    new Map([...empMap.entries()].map(([id, e]) => [id, e.nombre])),
  );

  const empresaIdPrincipal = office?.empresa_id || conductoresVinculos[0]?.empresaId || null;
  const codigoEmpresa = empresaIdPrincipal
    ? empMap.get(empresaIdPrincipal)?.codigo_equipo || empMap.get(empresaIdPrincipal)?.codigo_corto || null
    : null;

  let serviciosVisibles = [];
  if (office && empresaIdPrincipal) {
    const visQ = office.puede_ver_todos
      ? `servicios?empresa_id=eq.${empresaIdPrincipal}&select=id,estado,referencia,created_at&order=created_at.desc&limit=8`
      : `servicios?empresa_id=eq.${empresaIdPrincipal}&responsable_user_id=eq.${encodeURIComponent(userId)}&select=id,estado,referencia,created_at&order=created_at.desc&limit=8`;
    const visRows = await restSelect(visQ);
    serviciosVisibles = await enrichServiciosWithConductores(
      visRows.data || [],
      new Map([...empMap.entries()].map(([id, e]) => [id, e.nombre])),
    );
  }

  const servIds = [...new Set((servRows.data || []).map((s) => s.id))];
  let ultimosDocumentos = [];
  if (servIds.length) {
    const docRows = await restSelect(
      `servicio_documentos_extra?servicio_id=in.(${servIds.slice(0, 10).join(",")})&select=id,servicio_id,archivo_nombre,tipo,created_at&order=created_at.desc&limit=6`,
    );
    ultimosDocumentos = (docRows.data || []).map((d) => ({
      id: d.id,
      nombre: d.archivo_nombre || d.tipo || "Documento",
      servicioId: d.servicio_id,
      createdAt: d.created_at,
    }));
  }

  return {
    ok: true,
    usuario: {
      userId,
      email: authUser?.email || office?.email || null,
      nombre: profile?.nombre || office?.nombre || conductoresVinculos[0]?.nombre || "—",
      uid: userId,
      tipoCuenta: profile?.tipo_cuenta || "—",
      ultimoAcceso: authUser?.last_sign_in_at || null,
      activo: !profile?.is_archived,
      rolOficina: office?.rol || null,
      puedeVerTodos: office ? !!office.puede_ver_todos : null,
      empresaId: empresaIdPrincipal,
      empresaVinculada: office
        ? empMap.get(office.empresa_id)?.nombre || "—"
        : conductoresVinculos[0]?.empresaNombre || "—",
      codigoEmpresa,
      conductoresVinculos,
      serviciosAsignados,
      serviciosVisibles,
      ultimosDocumentos,
      officeUserId: office?.id || null,
      officeActivo: office ? office.activo !== false : null,
    },
    erroresRecientes: [],
    erroresDisponibles: false,
  };
}

async function handleSupportEmpresaDiagnostic(empresaId) {
  const detail = await handleEmpresaDetail(empresaId);
  if (!detail.ok) return detail;

  const condActivos = (detail.conductores || []).filter((c) => c.activo).length;
  const condInactivos = (detail.conductores || []).length - condActivos;
  const officeActivos = (detail.officeUsers || []).filter((u) => u.activo).length;
  const officeInactivos = (detail.officeUsers || []).length - officeActivos;

  return {
    ok: true,
    empresa: detail.empresa,
    resumen: {
      conductoresActivos: condActivos,
      conductoresInactivos: condInactivos,
      officeActivos,
      officeInactivos,
      serviciosActivos: detail.servicios?.stats?.activos || 0,
    },
    conductores: detail.conductores,
    officeUsers: detail.officeUsers,
    servicios: detail.servicios,
    documentos: detail.documentos,
    erroresRecientes: [],
    erroresDisponibles: false,
  };
}

async function handleSupportServicioDiagnostic(servicioId) {
  if (!servicioId || !UUID_RE.test(servicioId)) {
    return { ok: false, status: 400, error: "servicio_id inválido" };
  }

  const { data: servs } = await restSelect(
    `servicios?id=eq.${encodeURIComponent(servicioId)}&select=*`,
  );
  const servicio = servs[0];
  if (!servicio) return { ok: false, status: 404, error: "Servicio no encontrado" };

  const [stops, assigns, docs, evidencias, empRows] = await Promise.all([
    restSelect(
      `stops?servicio_id=eq.${encodeURIComponent(servicioId)}&select=id,orden,tipo,nombre,direccion,estado,created_at&order=orden.asc`,
    ),
    restSelect(
      `servicio_asignaciones?servicio_id=eq.${encodeURIComponent(servicioId)}&select=conductor_id,tipo_asignacion,created_at`,
    ),
    restSelect(
      `servicio_documentos_extra?servicio_id=eq.${encodeURIComponent(servicioId)}&select=id,tipo,archivo_nombre,created_at&order=created_at.desc&limit=15`,
    ),
    restSelect(
      `stops?servicio_id=eq.${encodeURIComponent(servicioId)}&select=id`,
    ).then(async (sr) => {
      const stopIds = (sr.data || []).map((s) => s.id);
      if (!stopIds.length) return { data: [] };
      return restSelect(
        `evidencias?stop_id=in.(${stopIds.join(",")})&select=id,stop_id,tipo,created_at&order=created_at.desc&limit=20`,
      );
    }),
    servicio.empresa_id
      ? restSelect(`empresas?id=eq.${encodeURIComponent(servicio.empresa_id)}&select=nombre`)
      : Promise.resolve({ data: [] }),
  ]);

  const condIds = [
    ...new Set([
      servicio.conductor_id,
      ...(assigns.data || []).map((a) => a.conductor_id),
    ].filter(Boolean)),
  ];
  const profMap = new Map();
  if (condIds.length) {
    const pr = await restSelect(
      `profiles?id=in.(${condIds.join(",")})&select=id,nombre`,
    );
    for (const p of pr.data || []) profMap.set(p.id, p.nombre || "—");
  }

  const empName = empRows.data?.[0]?.nombre || "—";
  const [normalized] = await enrichServiciosWithConductores(
    [servicio],
    new Map([[servicio.empresa_id, empName]]),
  );

  return {
    ok: true,
    servicio: normalized,
    conductorPrincipal: profMap.get(servicio.conductor_id) || null,
    colaboradores: (assigns.data || [])
      .filter((a) => a.conductor_id !== servicio.conductor_id)
      .map((a) => ({
        userId: a.conductor_id,
        nombre: profMap.get(a.conductor_id) || "—",
        tipo: a.tipo_asignacion,
      })),
    paradas: (stops.data || []).map((st) => ({
      id: st.id,
      orden: st.orden,
      tipo: st.tipo,
      nombre: st.nombre,
      direccion: st.direccion,
      estado: st.estado,
    })),
    evidencias: (evidencias.data || []).map((ev) => ({
      id: ev.id,
      tipo: ev.tipo,
      createdAt: ev.created_at,
    })),
    documentos: (docs.data || []).map((d) => ({
      id: d.id,
      tipo: d.tipo,
      nombre: d.archivo_nombre,
      createdAt: d.created_at,
    })),
    tecnico: {
      referenciaRaw: servicio.referencia,
      servicioId: servicio.id,
      empresaId: servicio.empresa_id,
      conductorId: servicio.conductor_id,
    },
    erroresRecientes: [],
    erroresDisponibles: false,
  };
}

async function handlePanelQuery(body) {
  const { view, filters, page, pageSize } = body || {};
  if (!view) {
    return { ok: false, status: 400, error: "view es obligatorio" };
  }
  return buildPanelQuery(
    {
      restSelect,
      restCount,
      enrichServiciosWithConductores,
      authAdminGetUser,
    },
    { view, filters: filters || {}, page, pageSize },
  );
}

async function handleResetPassword(userId) {
  if (!userId || !UUID_RE.test(userId)) {
    return { ok: false, status: 400, error: "user_id inválido" };
  }
  const ok = await authAdminSetUserPassword(userId, OFFICE_USER_TEMP_PASSWORD);
  if (!ok) {
    return { ok: false, status: 502, error: "No se pudo resetear la contraseña" };
  }
  return {
    ok: true,
    password: OFFICE_USER_TEMP_PASSWORD,
    message: `Contraseña temporal: ${OFFICE_USER_TEMP_PASSWORD}`,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
  }

  const auth = await requireSuperadmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      code: auth.code,
    });
  }

  const { action } = req.body || {};
  if (!action) {
    return res.status(400).json({ ok: false, error: "Missing action", code: "BAD_REQUEST" });
  }

  let result;
  switch (action) {
    case "dashboard":
      result = await handleDashboard();
      break;
    case "list_empresas":
      result = await handleListEmpresas();
      break;
    case "list_usuarios":
      result = await handleListUsuarios();
      break;
    case "list_servicios":
      result = await handleListServicios();
      break;
    case "list_documentos":
      result = await handleListDocumentos();
      break;
    case "panel_query":
      result = await handlePanelQuery(req.body || {});
      break;
    case "support_search": {
      const { query } = req.body || {};
      result = await handleSupportSearch(query);
      break;
    }
    case "support_user_detail": {
      const { user_id } = req.body || {};
      result = await handleSupportUserDetail(user_id);
      break;
    }
    case "support_empresa_diagnostic": {
      const { empresa_id } = req.body || {};
      result = await handleSupportEmpresaDiagnostic(empresa_id);
      break;
    }
    case "support_servicio_diagnostic": {
      const { servicio_id } = req.body || {};
      result = await handleSupportServicioDiagnostic(servicio_id);
      break;
    }
    case "empresa_detail": {
      const { empresa_id } = req.body || {};
      result = await handleEmpresaDetail(empresa_id);
      break;
    }
    case "create_empresa":
      result = await handleCreateEmpresa(req.body || {});
      break;
    case "toggle_empresa": {
      const { empresa_id, activa } = req.body || {};
      result = await handleToggleEmpresa(empresa_id, activa);
      break;
    }
    case "toggle_conductor": {
      const { conductor_empresa_id, activo } = req.body || {};
      result = await handleToggleConductor(conductor_empresa_id, activo);
      break;
    }
    case "toggle_office_user": {
      const { empresa_usuario_id, activo } = req.body || {};
      result = await handleToggleOfficeUser(empresa_usuario_id, activo);
      break;
    }
    case "reset_password": {
      const { user_id } = req.body || {};
      result = await handleResetPassword(user_id);
      break;
    }
    default:
      return res.status(501).json({
        ok: false,
        error: `Unknown action: ${action}`,
        code: "NOT_IMPLEMENTED",
      });
  }

  if (!result.ok) {
    return res.status(result.status || 500).json({
      ok: false,
      error: result.error || "Error interno",
      code: "SUPERADMIN_ERROR",
    });
  }

  return res.json(result);
}
