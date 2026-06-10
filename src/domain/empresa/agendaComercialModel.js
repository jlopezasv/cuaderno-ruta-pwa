import { sbFetch } from "../../data/supabaseClient.js";
import { AGENDA_VISTAS, estadoComercialLabel, tipoAccionLabel } from "./agendaComercialConstants.js";

const PROSPECTO_COLS =
  "id,tenant_empresa_id,nombre,cif,direccion,localidad,provincia,telefono,email,web,sector,estado_comercial,num_camiones,tipos_vehiculos,tipos_rutas,sistemas_actuales,dolores,ultima_nota,created_at,updated_at";

const CONTACTO_COLS =
  "id,prospecto_id,tenant_empresa_id,nombre,cargo,telefono,email,whatsapp,observaciones,es_principal,created_at";

const ACCION_COLS =
  "id,prospecto_id,tenant_empresa_id,tipo,fecha_hora,contacto_nombre,resultado,proxima_accion,notas,completada,created_at";

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeek(d) {
  return endOfDay(addDays(startOfWeek(d), 6));
}

function norm(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function pickPrincipalContacto(contactos) {
  const list = Array.isArray(contactos) ? contactos : [];
  return list.find((c) => c.es_principal) || list[0] || null;
}

function proximaAccionPendiente(acciones, now = new Date()) {
  const list = (Array.isArray(acciones) ? acciones : [])
    .filter((a) => !a.completada)
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime());
  const future = list.filter((a) => new Date(a.fecha_hora).getTime() >= now.getTime());
  return future[0] || list[0] || null;
}

function formatFechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function fetchAgendaComercialBundle(tenantEmpresaId) {
  if (!tenantEmpresaId) return { prospectos: [], contactos: [], acciones: [], tableMissing: false };

  const [pr, cr, ar] = await Promise.all([
    sbFetch(
      `/rest/v1/agenda_comercial_prospectos?tenant_empresa_id=eq.${tenantEmpresaId}&order=updated_at.desc&select=${PROSPECTO_COLS}`,
    ),
    sbFetch(
      `/rest/v1/agenda_comercial_contactos?tenant_empresa_id=eq.${tenantEmpresaId}&order=es_principal.desc,created_at.asc&select=${CONTACTO_COLS}`,
    ),
    sbFetch(
      `/rest/v1/agenda_comercial_acciones?tenant_empresa_id=eq.${tenantEmpresaId}&order=fecha_hora.asc&select=${ACCION_COLS}`,
    ),
  ]);

  if (pr.status === 404 || cr.status === 404 || ar.status === 404) {
    return { prospectos: [], contactos: [], acciones: [], tableMissing: true };
  }

  const prospectos = pr.ok ? await pr.json().catch(() => []) : [];
  const contactos = cr.ok ? await cr.json().catch(() => []) : [];
  const acciones = ar.ok ? await ar.json().catch(() => []) : [];

  if (!pr.ok && !cr.ok && !ar.ok) {
    const body = await pr.text().catch(() => "");
    if (body.includes("does not exist") || pr.status === 400) {
      return { prospectos: [], contactos: [], acciones: [], tableMissing: true };
    }
  }

  return {
    prospectos: Array.isArray(prospectos) ? prospectos : [],
    contactos: Array.isArray(contactos) ? contactos : [],
    acciones: Array.isArray(acciones) ? acciones : [],
    tableMissing: false,
  };
}

export function buildAgendaProspectoRows(bundle, now = new Date()) {
  const contactosByPros = {};
  for (const c of bundle?.contactos || []) {
    if (!contactosByPros[c.prospecto_id]) contactosByPros[c.prospecto_id] = [];
    contactosByPros[c.prospecto_id].push(c);
  }
  const accionesByPros = {};
  for (const a of bundle?.acciones || []) {
    if (!accionesByPros[a.prospecto_id]) accionesByPros[a.prospecto_id] = [];
    accionesByPros[a.prospecto_id].push(a);
  }

  return (bundle?.prospectos || []).map((p) => {
    const contactos = contactosByPros[p.id] || [];
    const acciones = accionesByPros[p.id] || [];
    const principal = pickPrincipalContacto(contactos);
    const proxima = proximaAccionPendiente(acciones, now);
    const vencida = acciones.some(
      (a) => !a.completada && new Date(a.fecha_hora).getTime() < now.getTime(),
    );

    return {
      ...p,
      contactos,
      acciones,
      contactoPrincipal: principal?.nombre || "—",
      telefonoPrincipal: principal?.telefono || p.telefono || "—",
      estadoLabel: estadoComercialLabel(p.estado_comercial),
      proximaCita: proxima,
      proximaCitaLabel: proxima ? formatFechaHora(proxima.fecha_hora) : "—",
      ultimaNotaCorta: (p.ultima_nota || "").slice(0, 80) || "—",
      seguimientoVencido: vencida,
    };
  });
}

export function computeAgendaKpis(rows, now = new Date()) {
  const list = Array.isArray(rows) ? rows : [];
  const weekEnd = endOfWeek(now);
  let demosPrevistas = 0;
  let pruebasActivas = 0;
  let pendientesContactar = 0;
  let seguimientosVencidos = 0;
  let citasSemana = 0;

  for (const row of list) {
    if (row.estado_comercial === "pendiente_contactar") pendientesContactar += 1;
    if (row.estado_comercial === "demo_prevista") demosPrevistas += 1;
    if (row.estado_comercial === "prueba_activa") pruebasActivas += 1;
    if (row.seguimientoVencido) seguimientosVencidos += 1;
    for (const a of row.acciones || []) {
      if (a.completada) continue;
      const t = new Date(a.fecha_hora).getTime();
      if (t >= startOfWeek(now).getTime() && t <= weekEnd.getTime()) citasSemana += 1;
    }
  }

  return {
    empresasRegistradas: list.length,
    pendientesContactar,
    demosPrevistas,
    pruebasActivas,
    seguimientosVencidos,
    citasSemana,
  };
}

export function applyAgendaListFilters(rows, filters = {}, agendaVista = AGENDA_VISTAS.TODAS, now = new Date()) {
  const f = filters;
  let list = [...(rows || [])];

  if (f.estadoComercial) {
    list = list.filter((r) => r.estado_comercial === f.estadoComercial);
  }
  if (f.localidad) {
    list = list.filter((r) => norm(r.localidad).includes(norm(f.localidad)));
  }
  if (f.camionesMin) {
    const min = Number(f.camionesMin);
    if (Number.isFinite(min)) list = list.filter((r) => (r.num_camiones || 0) >= min);
  }
  if (f.tipoRuta) {
    list = list.filter((r) => (r.tipos_rutas || []).includes(f.tipoRuta));
  }
  if (f.sistemaActual) {
    list = list.filter((r) => (r.sistemas_actuales || []).includes(f.sistemaActual));
  }
  if (f.soloPendientesSeguimiento) {
    list = list.filter((r) => r.seguimientoVencido);
  }

  if (agendaVista === AGENDA_VISTAS.HOY) {
    const s = startOfDay(now).getTime();
    const e = endOfDay(now).getTime();
    list = list.filter((r) =>
      (r.acciones || []).some((a) => {
        const t = new Date(a.fecha_hora).getTime();
        return !a.completada && t >= s && t <= e;
      }),
    );
  } else if (agendaVista === AGENDA_VISTAS.SEMANA) {
    const s = startOfWeek(now).getTime();
    const e = endOfWeek(now).getTime();
    list = list.filter((r) =>
      (r.acciones || []).some((a) => {
        const t = new Date(a.fecha_hora).getTime();
        return !a.completada && t >= s && t <= e;
      }),
    );
  } else if (agendaVista === AGENDA_VISTAS.PROXIMAS) {
    list = list.filter((r) => r.proximaCita && new Date(r.proximaCita.fecha_hora).getTime() >= now.getTime());
    list.sort(
      (a, b) =>
        new Date(a.proximaCita.fecha_hora).getTime() - new Date(b.proximaCita.fecha_hora).getTime(),
    );
  } else if (agendaVista === AGENDA_VISTAS.VENCIDAS) {
    list = list.filter((r) => r.seguimientoVencido);
  }

  if (f.q) {
    const q = norm(f.q);
    list = list.filter((r) => {
      const blob = [r.nombre, r.localidad, r.contactoPrincipal, r.telefonoPrincipal, r.ultima_nota]
        .map(norm)
        .join(" ");
      return blob.includes(q);
    });
  }

  return list;
}

export function listAccionesAgenda(rows, agendaVista, now = new Date()) {
  const acciones = [];
  for (const row of rows || []) {
    for (const a of row.acciones || []) {
      acciones.push({ ...a, prospectoNombre: row.nombre, prospectoId: row.id });
    }
  }
  acciones.sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime());

  if (agendaVista === AGENDA_VISTAS.HOY) {
    const s = startOfDay(now).getTime();
    const e = endOfDay(now).getTime();
    return acciones.filter((a) => {
      const t = new Date(a.fecha_hora).getTime();
      return !a.completada && t >= s && t <= e;
    });
  }
  if (agendaVista === AGENDA_VISTAS.SEMANA) {
    const s = startOfWeek(now).getTime();
    const e = endOfWeek(now).getTime();
    return acciones.filter((a) => {
      const t = new Date(a.fecha_hora).getTime();
      return !a.completada && t >= s && t <= e;
    });
  }
  if (agendaVista === AGENDA_VISTAS.PROXIMAS) {
    return acciones.filter((a) => !a.completada && new Date(a.fecha_hora).getTime() >= now.getTime());
  }
  if (agendaVista === AGENDA_VISTAS.VENCIDAS) {
    return acciones.filter((a) => !a.completada && new Date(a.fecha_hora).getTime() < now.getTime());
  }
  return acciones.filter((a) => !a.completada);
}

export function emptyProspectoForm() {
  return {
    nombre: "",
    cif: "",
    direccion: "",
    localidad: "",
    provincia: "",
    telefono: "",
    email: "",
    web: "",
    sector: "",
    estado_comercial: "pendiente_contactar",
    num_camiones: "",
    tipos_vehiculos: [],
    tipos_rutas: [],
    sistemas_actuales: [],
    dolores: [],
    ultima_nota: "",
  };
}

export function emptyContactoForm() {
  return {
    nombre: "",
    cargo: "",
    telefono: "",
    email: "",
    whatsapp: "",
    observaciones: "",
    es_principal: false,
  };
}

export function emptyAccionForm() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    tipo: "llamada",
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    contacto_nombre: "",
    resultado: "",
    proxima_accion: "",
    notas: "",
    completada: false,
  };
}

function toIsoDateTime(fecha, hora) {
  if (!fecha) return new Date().toISOString();
  const h = hora || "09:00";
  return new Date(`${fecha}T${h}:00`).toISOString();
}

function toggleArray(arr, value) {
  const list = Array.isArray(arr) ? [...arr] : [];
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  else list.push(value);
  return list;
}

export { toggleArray, formatFechaHora, tipoAccionLabel };

export async function saveProspecto(tenantEmpresaId, form, existingId = null) {
  const body = {
    tenant_empresa_id: tenantEmpresaId,
    nombre: String(form.nombre || "").trim(),
    cif: form.cif || null,
    direccion: form.direccion || null,
    localidad: form.localidad || null,
    provincia: form.provincia || null,
    telefono: form.telefono || null,
    email: form.email || null,
    web: form.web || null,
    sector: form.sector || null,
    estado_comercial: form.estado_comercial || "pendiente_contactar",
    num_camiones: form.num_camiones === "" || form.num_camiones == null ? null : Number(form.num_camiones),
    tipos_vehiculos: form.tipos_vehiculos || [],
    tipos_rutas: form.tipos_rutas || [],
    sistemas_actuales: form.sistemas_actuales || [],
    dolores: form.dolores || [],
    ultima_nota: form.ultima_nota || null,
    updated_at: new Date().toISOString(),
  };
  if (!body.nombre) throw new Error("El nombre de empresa es obligatorio");

  if (existingId) {
    const r = await sbFetch(`/rest/v1/agenda_comercial_prospectos?id=eq.${existingId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("No se pudo actualizar la empresa");
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : null;
  }

  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined;
  const r = await sbFetch(`/rest/v1/agenda_comercial_prospectos`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(id ? { id, ...body } : body),
  });
  if (!r.ok) throw new Error("No se pudo crear la empresa");
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : null;
}

export async function deleteProspecto(id) {
  const r = await sbFetch(`/rest/v1/agenda_comercial_prospectos?id=eq.${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("No se pudo eliminar");
}

export async function saveContacto(tenantEmpresaId, prospectoId, form, existingId = null) {
  const body = {
    tenant_empresa_id: tenantEmpresaId,
    prospecto_id: prospectoId,
    nombre: String(form.nombre || "").trim(),
    cargo: form.cargo || null,
    telefono: form.telefono || null,
    email: form.email || null,
    whatsapp: form.whatsapp || null,
    observaciones: form.observaciones || null,
    es_principal: !!form.es_principal,
  };
  if (!body.nombre) throw new Error("El nombre del contacto es obligatorio");

  if (existingId) {
    const r = await sbFetch(`/rest/v1/agenda_comercial_contactos?id=eq.${existingId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("No se pudo actualizar el contacto");
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : null;
  }

  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined;
  const r = await sbFetch(`/rest/v1/agenda_comercial_contactos`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(id ? { id, ...body } : body),
  });
  if (!r.ok) throw new Error("No se pudo crear el contacto");
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : null;
}

export async function deleteContacto(id) {
  const r = await sbFetch(`/rest/v1/agenda_comercial_contactos?id=eq.${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("No se pudo eliminar el contacto");
}

export async function saveAccion(tenantEmpresaId, prospectoId, form, existingId = null) {
  const body = {
    tenant_empresa_id: tenantEmpresaId,
    prospecto_id: prospectoId,
    tipo: form.tipo || "seguimiento",
    fecha_hora: toIsoDateTime(form.fecha, form.hora),
    contacto_nombre: form.contacto_nombre || null,
    resultado: form.resultado || null,
    proxima_accion: form.proxima_accion || null,
    notas: form.notas || null,
    completada: !!form.completada,
  };

  if (existingId) {
    const r = await sbFetch(`/rest/v1/agenda_comercial_acciones?id=eq.${existingId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("No se pudo actualizar la cita");
    const rows = await r.json();
    const saved = Array.isArray(rows) ? rows[0] : null;
    if (form.notas) await patchUltimaNota(prospectoId, form.notas);
    return saved;
  }

  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined;
  const r = await sbFetch(`/rest/v1/agenda_comercial_acciones`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(id ? { id, ...body } : body),
  });
  if (!r.ok) throw new Error("No se pudo crear la cita");
  const rows = await r.json();
  const saved = Array.isArray(rows) ? rows[0] : null;
  if (form.notas) await patchUltimaNota(prospectoId, form.notas);
  return saved;
}

async function patchUltimaNota(prospectoId, nota) {
  await sbFetch(`/rest/v1/agenda_comercial_prospectos?id=eq.${prospectoId}`, {
    method: "PATCH",
    body: JSON.stringify({ ultima_nota: nota, updated_at: new Date().toISOString() }),
  });
}

export async function toggleAccionCompletada(accion, completada) {
  const r = await sbFetch(`/rest/v1/agenda_comercial_acciones?id=eq.${accion.id}`, {
    method: "PATCH",
    body: JSON.stringify({ completada }),
  });
  if (!r.ok) throw new Error("No se pudo actualizar");
}

export async function deleteAccion(id) {
  const r = await sbFetch(`/rest/v1/agenda_comercial_acciones?id=eq.${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("No se pudo eliminar la cita");
}

export function prospectoToForm(p) {
  if (!p) return emptyProspectoForm();
  return {
    nombre: p.nombre || "",
    cif: p.cif || "",
    direccion: p.direccion || "",
    localidad: p.localidad || "",
    provincia: p.provincia || "",
    telefono: p.telefono || "",
    email: p.email || "",
    web: p.web || "",
    sector: p.sector || "",
    estado_comercial: p.estado_comercial || "pendiente_contactar",
    num_camiones: p.num_camiones ?? "",
    tipos_vehiculos: p.tipos_vehiculos || [],
    tipos_rutas: p.tipos_rutas || [],
    sistemas_actuales: p.sistemas_actuales || [],
    dolores: p.dolores || [],
    ultima_nota: p.ultima_nota || "",
  };
}

export function accionToForm(a) {
  if (!a) return emptyAccionForm();
  const d = new Date(a.fecha_hora);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    tipo: a.tipo || "llamada",
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    contacto_nombre: a.contacto_nombre || "",
    resultado: a.resultado || "",
    proxima_accion: a.proxima_accion || "",
    notas: a.notas || "",
    completada: !!a.completada,
  };
}
