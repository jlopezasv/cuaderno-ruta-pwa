import {
  normalizeServicioAdminRow,
  parseServicioOperacionMeta,
  stripServicioOperacionDisplay,
} from "./servicioDisplay.js";

const SERVICIO_ESTADOS_ACTIVOS = ["pendiente_asignacion", "asignado", "en_curso"];
const SERVICIO_ESTADOS_COMPLETADOS = ["completado", "cerrado"];

function prodEmpresaFilter() {
  return "is_test=eq.false";
}

function dateRangeFromFiltro(fecha, custom = {}) {
  const now = new Date();
  if (fecha === "hoy") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { desde: start.toISOString(), hasta: now.toISOString() };
  }
  if (fecha === "7d") {
    return { desde: new Date(now.getTime() - 7 * 86400000).toISOString(), hasta: now.toISOString() };
  }
  if (fecha === "30d") {
    return { desde: new Date(now.getTime() - 30 * 86400000).toISOString(), hasta: now.toISOString() };
  }
  if (fecha === "mes") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { desde: start.toISOString(), hasta: now.toISOString() };
  }
  if (fecha === "custom" && custom.desde) {
    return { desde: custom.desde, hasta: custom.hasta || now.toISOString() };
  }
  return null;
}

function monthStartIso() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function matchesQ(text, q) {
  if (!q) return true;
  return String(text || "").toLowerCase().includes(q);
}

function paginateSlice(rows, page, pageSize) {
  const p = Math.max(0, Number(page) || 0);
  const ps = Math.min(100, Math.max(10, Number(pageSize) || 25));
  const start = p * ps;
  return {
    rows: rows.slice(start, start + ps),
    page: p,
    pageSize: ps,
    total: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / ps)),
  };
}

export async function buildPanelQuery(deps, { view, filters = {}, page = 0, pageSize = 25 }) {
  const { restSelect, restCount, enrichServiciosWithConductores, authAdminGetUser } = deps;
  const q = String(filters.q || "").trim().toLowerCase();
  const prod = prodEmpresaFilter();
  const range = dateRangeFromFiltro(filters.fecha, filters);

  const { data: allEmps } = await restSelect(
    `empresas?${prod}&select=id,nombre,cif,codigo_equipo,codigo_corto,activa,created_at,owner_id&order=nombre.asc`,
  );
  const empMap = new Map((allEmps || []).map((e) => [e.id, e]));
  const empName = (id) => empMap.get(id)?.nombre || "—";

  if (view === "meta") {
    return {
      ok: true,
      empresas: (allEmps || []).map((e) => ({
        id: e.id,
        nombre: e.nombre,
        codigoEquipo: e.codigo_equipo || e.codigo_corto,
      })),
    };
  }

  if (view === "dashboard_alerts") {
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

    const [servs, envios, ubicaciones, officeInactive, ceRows] = await Promise.all([
      restSelect(
        "servicios?select=id,empresa_id,conductor_id,estado,created_at,referencia&empresa_id=not.is.null&order=created_at.desc&limit=500",
      ),
      restSelect(
        "documentacion_envios?select=id,servicio_id,estado,created_at&order=created_at.desc&limit=200",
      ).catch(() => ({ data: [] })),
      restSelect("ubicaciones?select=user_id,ts&order=ts.desc&limit=300"),
      restCount("empresa_usuarios?activo=eq.false"),
      restSelect("conductor_empresa?activo=eq.true&select=user_id,empresa_id"),
    ]);

    const empIds = new Set((allEmps || []).map((e) => e.id));
    const lastByEmp = new Map();
    for (const s of servs.data || []) {
      if (!s.empresa_id || !empIds.has(s.empresa_id)) continue;
      if (!lastByEmp.has(s.empresa_id)) lastByEmp.set(s.empresa_id, s.created_at);
    }
    const sinActividad = (allEmps || [])
      .filter((e) => {
        const last = lastByEmp.get(e.id);
        return !last || last < since30;
      })
      .map((e) => ({ id: e.id, nombre: e.nombre, ultimoServicio: lastByEmp.get(e.id) || null }));

    const sinConductor = (servs.data || []).filter(
      (s) => SERVICIO_ESTADOS_ACTIVOS.includes(s.estado) && !s.conductor_id,
    ).length;

    const envRows = envios.data || [];
    const envPendiente = envRows.filter((e) => e.estado === "pendiente" || e.estado === "simulado").length;
    const envError = envRows.filter((e) => e.estado === "error" || e.error_detalle).length;

    const ubicUserTs = new Map();
    for (const u of ubicaciones.data || []) {
      if (!ubicUserTs.has(u.user_id)) ubicUserTs.set(u.user_id, u.ts);
    }
    const activeCondIds = new Set((ceRows.data || []).map((c) => c.user_id));
    let condSinUbicacion = 0;
    for (const uid of activeCondIds) {
      const ts = ubicUserTs.get(uid);
      if (!ts || ts < since7) condSinUbicacion += 1;
    }

    const ultimasCreadas = [...(allEmps || [])]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        codigoEquipo: e.codigo_equipo || e.codigo_corto,
        createdAt: e.created_at,
        activa: e.activa !== false,
      }));

    return {
      ok: true,
      alerts: {
        empresasSinActividad: sinActividad.slice(0, 10),
        serviciosSinConductor: sinConductor,
        enviosPendientes: envPendiente,
        enviosError: envError,
        conductoresSinUbicacion: condSinUbicacion,
        usuariosOficinaInactivos: officeInactive,
        ultimasEmpresasCreadas: ultimasCreadas,
      },
    };
  }

  if (view === "empresas") {
    let rows = (allEmps || []).map((e) => ({ ...e, _empresaId: e.id }));

    if (filters.empresaId && filters.empresaId !== "all") {
      rows = rows.filter((e) => e.id === filters.empresaId);
    }
    if (filters.empresaActiva === "activa") rows = rows.filter((e) => e.activa !== false);
    if (filters.empresaActiva === "inactiva") rows = rows.filter((e) => e.activa === false);
    if (q) {
      rows = rows.filter(
        (e) =>
          matchesQ(e.nombre, q) ||
          matchesQ(e.cif, q) ||
          matchesQ(e.codigo_equipo || e.codigo_corto, q),
      );
    }

    const [ceAll, euAll, servAll, servMes] = await Promise.all([
      restSelect("conductor_empresa?select=empresa_id,user_id,activo"),
      restSelect("empresa_usuarios?select=empresa_id,activo"),
      restSelect("servicios?select=empresa_id,estado,created_at&empresa_id=not.is.null"),
      restSelect(`servicios?select=empresa_id&created_at=gte.${monthStartIso()}`),
    ]);

    const metrics = new Map();
    for (const e of rows) {
      metrics.set(e.id, {
        condAct: 0,
        condTot: 0,
        offAct: 0,
        offTot: 0,
        servAct: 0,
        servMes: 0,
        ultimo: null,
      });
    }
    for (const c of ceAll.data || []) {
      const m = metrics.get(c.empresa_id);
      if (!m) continue;
      m.condTot += 1;
      if (c.activo !== false) m.condAct += 1;
    }
    for (const u of euAll.data || []) {
      const m = metrics.get(u.empresa_id);
      if (!m) continue;
      m.offTot += 1;
      if (u.activo !== false) m.offAct += 1;
    }
    for (const s of servAll.data || []) {
      const m = metrics.get(s.empresa_id);
      if (!m) continue;
      if (SERVICIO_ESTADOS_ACTIVOS.includes(s.estado)) m.servAct += 1;
      if (!m.ultimo || s.created_at > m.ultimo) m.ultimo = s.created_at;
    }
    for (const s of servMes.data || []) {
      const m = metrics.get(s.empresa_id);
      if (m) m.servMes += 1;
    }

    const list = rows.map((e) => {
      const m = metrics.get(e.id) || {};
      return {
        id: e.id,
        nombre: e.nombre,
        cif: e.cif || null,
        codigoEquipo: e.codigo_equipo || e.codigo_corto || null,
        activa: e.activa !== false,
        conductoresActivos: m.condAct || 0,
        conductoresTotales: m.condTot || 0,
        officeActivos: m.offAct || 0,
        officeTotales: m.offTot || 0,
        serviciosActivos: m.servAct || 0,
        serviciosMes: m.servMes || 0,
        ultimaActividad: m.ultimo || null,
      };
    });

    const pg = paginateSlice(list, page, pageSize);
    return { ok: true, ...pg };
  }

  if (view === "conductores") {
    let qCe = "conductor_empresa?select=id,user_id,empresa_id,nombre,matricula,telefono_movil,activo,created_at&order=created_at.desc&limit=400";
    const { data: ceRows } = await restSelect(qCe);
    let rows = ceRows || [];

    if (filters.empresaId && filters.empresaId !== "all") {
      rows = rows.filter((c) => c.empresa_id === filters.empresaId);
    }
    if (filters.activo === "activos") rows = rows.filter((c) => c.activo !== false);
    if (filters.activo === "inactivos") rows = rows.filter((c) => c.activo === false);

    const userIds = [...new Set(rows.map((c) => c.user_id).filter(Boolean))];
    const profMap = new Map();
    if (userIds.length) {
      const pr = await restSelect(
        `profiles?id=in.(${userIds.join(",")})&select=id,nombre,telefono,is_archived`,
      );
      for (const p of pr.data || []) profMap.set(p.id, p);
    }

    const { data: servs } = await restSelect(
      "servicios?select=id,conductor_id,estado,created_at,referencia&conductor_id=not.is.null&order=created_at.desc&limit=400",
    );
    const servByCond = new Map();
    for (const s of servs || []) {
      if (!servByCond.has(s.conductor_id)) servByCond.set(s.conductor_id, []);
      servByCond.get(s.conductor_id).push(s);
    }

    const { data: ubi } = await restSelect("ubicaciones?select=user_id,ts,lat,lon&order=ts.desc&limit=300");
    const ubiMap = new Map();
    for (const u of ubi || []) {
      if (!ubiMap.has(u.user_id)) ubiMap.set(u.user_id, u);
    }

    let list = rows.map((c) => {
      const prof = profMap.get(c.user_id);
      const condServs = servByCond.get(c.user_id) || [];
      const activos = condServs.filter((s) => SERVICIO_ESTADOS_ACTIVOS.includes(s.estado)).length;
      const ultimo = condServs[0]?.created_at || null;
      const u = ubiMap.get(c.user_id);
      return {
        id: c.id,
        userId: c.user_id,
        nombre: prof?.nombre || c.nombre || "—",
        email: null,
        telefono: c.telefono_movil || prof?.telefono || null,
        matricula: c.matricula || null,
        empresaId: c.empresa_id,
        empresaNombre: empName(c.empresa_id),
        activo: c.activo !== false && !prof?.is_archived,
        ultimaUbicacion: u?.ts || null,
        serviciosActivos: activos,
        ultimoServicio: ultimo,
      };
    });

    if (q) {
      list = list.filter(
        (c) =>
          matchesQ(c.nombre, q) ||
          matchesQ(c.matricula, q) ||
          matchesQ(c.telefono, q) ||
          matchesQ(c.empresaNombre, q),
      );
    }

    const pg = paginateSlice(list, page, pageSize);
    return { ok: true, ...pg };
  }

  if (view === "usuarios_oficina") {
    let { data: euRows } = await restSelect(
      "empresa_usuarios?select=id,user_id,empresa_id,nombre,email,rol,puede_ver_todos,activo,created_at&order=created_at.desc&limit=400",
    );
    let rows = euRows || [];

    if (filters.empresaId && filters.empresaId !== "all") {
      rows = rows.filter((u) => u.empresa_id === filters.empresaId);
    }
    if (filters.tipoUsuario && filters.tipoUsuario !== "all") {
      rows = rows.filter((u) => u.rol === filters.tipoUsuario);
    }
    if (filters.activo === "activos") rows = rows.filter((u) => u.activo !== false);
    if (filters.activo === "inactivos") rows = rows.filter((u) => u.activo === false);
    if (q) {
      rows = rows.filter(
        (u) =>
          matchesQ(u.nombre, q) ||
          matchesQ(u.email, q) ||
          matchesQ(empName(u.empresa_id), q),
      );
    }

    const list = rows.map((u) => ({
      id: u.id,
      userId: u.user_id,
      nombre: u.nombre || "—",
      email: u.email || null,
      empresaId: u.empresa_id,
      empresaNombre: empName(u.empresa_id),
      rol: u.rol,
      puedeVerTodos: !!u.puede_ver_todos,
      activo: u.activo !== false,
      createdAt: u.created_at,
    }));

    const pg = paginateSlice(list, page, pageSize);
    return { ok: true, ...pg };
  }

  if (view === "servicios") {
    let { data: servs } = await restSelect(
      "servicios?select=id,referencia,estado,origen,destino,empresa_id,conductor_id,responsable_nombre,responsable_user_id,created_at,updated_at,fecha_inicio&empresa_id=not.is.null&order=created_at.desc&limit=350",
    );
    let rows = servs || [];

    if (filters.empresaId && filters.empresaId !== "all") {
      rows = rows.filter((s) => s.empresa_id === filters.empresaId);
    }
    if (filters.servicioFiltro === "activos") {
      rows = rows.filter((s) => SERVICIO_ESTADOS_ACTIVOS.includes(s.estado));
    } else if (filters.servicioFiltro === "completados") {
      rows = rows.filter((s) => SERVICIO_ESTADOS_COMPLETADOS.includes(s.estado));
    } else if (filters.servicioFiltro === "sin_conductor") {
      rows = rows.filter((s) => !s.conductor_id);
    } else if (filters.servicioFiltro === "ultimos_7d") {
      const d = new Date(Date.now() - 7 * 86400000).toISOString();
      rows = rows.filter((s) => s.created_at >= d);
    } else if (filters.servicioFiltro === "mes") {
      rows = rows.filter((s) => s.created_at >= monthStartIso());
    }
    if (range) {
      rows = rows.filter((s) => s.created_at >= range.desde && s.created_at <= range.hasta);
    }

    const empNameMap = new Map([...empMap.entries()].map(([id, e]) => [id, e.nombre]));
    let normalized = await enrichServiciosWithConductores(rows, empNameMap);

    const servIds = rows.map((s) => s.id);
    const docCounts = new Map();
    const incCounts = new Map();
    if (servIds.length) {
      const docs = await restSelect(
        `servicio_documentos_extra?servicio_id=in.(${servIds.slice(0, 80).join(",")})&select=servicio_id`,
      ).catch(() => ({ data: [] }));
      for (const d of docs.data || []) {
        docCounts.set(d.servicio_id, (docCounts.get(d.servicio_id) || 0) + 1);
      }
      const stops = await restSelect(
        `stops?servicio_id=in.(${servIds.slice(0, 80).join(",")})&select=id,servicio_id`,
      );
      const stopIds = (stops.data || []).map((s) => s.id);
      if (stopIds.length) {
        const ev = await restSelect(
          `evidencias?stop_id=in.(${stopIds.slice(0, 120).join(",")})&tipo=eq.incidencia&select=stop_id`,
        );
        const stopToServ = new Map((stops.data || []).map((s) => [s.id, s.servicio_id]));
        for (const e of ev.data || []) {
          const sid = stopToServ.get(e.stop_id);
          if (sid) incCounts.set(sid, (incCounts.get(sid) || 0) + 1);
        }
      }
    }

    if (filters.servicioFiltro === "incidencia") {
      normalized = normalized.filter((s) => (incCounts.get(s.id) || 0) > 0);
    }

    if (q) {
      normalized = normalized.filter(
        (s) =>
          matchesQ(s.refServicio, q) ||
          matchesQ(s.cliente, q) ||
          matchesQ(s.empresaNombre, q) ||
          matchesQ(s.ruta, q),
      );
    }

    const list = normalized.map((s) => {
      const raw = rows.find((r) => r.id === s.id);
      return {
        ...s,
        responsable: raw?.responsable_nombre || "—",
        fechaSalida: raw?.fecha_inicio || s.fecha,
        documentos: docCounts.get(s.id) || 0,
        incidencias: incCounts.get(s.id) || 0,
      };
    });

    const pg = paginateSlice(list, page, pageSize);
    return { ok: true, ...pg };
  }

  if (view === "documentos") {
    const { data: docs } = await restSelect(
      "servicio_documentos_extra?select=id,servicio_id,empresa_id,tipo,archivo_nombre,created_at&order=created_at.desc&limit=300",
    );
    const { data: envios } = await restSelect(
      "documentacion_envios?select=id,servicio_id,empresa_id,estado,error_detalle,created_at,sent_at&order=created_at.desc&limit=300",
    ).catch(() => ({ data: [] }));

    const envByServ = new Map();
    for (const e of envios.data || []) {
      if (!envByServ.has(e.servicio_id)) envByServ.set(e.servicio_id, e);
    }

    const byServ = new Map();
    for (const d of docs || []) {
      if (!byServ.has(d.servicio_id)) {
        byServ.set(d.servicio_id, { docs: [], empresaId: d.empresa_id });
      }
      byServ.get(d.servicio_id).docs.push(d);
    }

    const servIds = [...byServ.keys()];
    let servMap = new Map();
    if (servIds.length) {
      const sr = await restSelect(
        `servicios?id=in.(${servIds.slice(0, 100).join(",")})&select=id,referencia,empresa_id`,
      );
      for (const s of sr.data || []) {
        servMap.set(s.id, s);
      }
    }

    let list = [];
    for (const [servicioId, bundle] of byServ.entries()) {
      const serv = servMap.get(servicioId);
      const norm = serv ? normalizeServicioAdminRow(serv, { empresaNombre: empName(serv.empresa_id) }) : null;
      const env = envByServ.get(servicioId);
      const estadoEnvio = env?.estado || "sin_envio";
      list.push({
        servicioId,
        refServicio: norm?.refServicio || servicioId.slice(0, 8),
        empresaNombre: empName(bundle.empresaId || serv?.empresa_id),
        cliente: norm?.cliente || "Sin cliente",
        estadoEnvio,
        errorEnvio: env?.error_detalle || null,
        fecha: bundle.docs[0]?.created_at || env?.created_at,
        numDocumentos: bundle.docs.length,
        envioId: env?.id || null,
      });
    }

    if (filters.documentoFiltro === "enviados") {
      list = list.filter((d) => d.estadoEnvio === "enviado" || d.estadoEnvio === "sent");
    } else if (filters.documentoFiltro === "pendientes") {
      list = list.filter((d) => d.estadoEnvio === "pendiente" || d.estadoEnvio === "simulado");
    } else if (filters.documentoFiltro === "error") {
      list = list.filter((d) => d.estadoEnvio === "error" || d.errorEnvio);
    } else if (filters.documentoFiltro === "sin_documentos") {
      list = [];
    }
    if (filters.empresaId && filters.empresaId !== "all") {
      list = list.filter((d) => {
        const serv = servMap.get(d.servicioId);
        return serv?.empresa_id === filters.empresaId;
      });
    }
    if (q) {
      list = list.filter(
        (d) =>
          matchesQ(d.refServicio, q) ||
          matchesQ(d.cliente, q) ||
          matchesQ(d.empresaNombre, q),
      );
    }

    list.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    const pg = paginateSlice(list, page, pageSize);
    return { ok: true, ...pg };
  }

  return { ok: false, status: 400, error: `Vista no válida: ${view}` };
}
