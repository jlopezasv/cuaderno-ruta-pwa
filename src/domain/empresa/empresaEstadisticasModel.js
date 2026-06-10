import { sbFetch } from "../../data/supabaseClient.js";
import { fetchLatestDocumentacionEnvioByServicioIds } from "../mail/documentacionEnviosQuery.js";
import { ESTADO_LABEL, SERVICIO_ESTADOS_DB } from "../fleet/serviceStatus.js";
import { resolveEnvioClienteEstado } from "../mail/clienteMailEnvioStatus.js";
import {
  getServiceClient,
  getServiceNumberForDisplay,
  resolveServiceRouteEndpoints,
} from "../service/serviceIdentity.js";
import { filterServiciosForOfficeUser } from "./officeUserFilters.js";
import { endOfDayIso, startOfDayIso } from "./empresaEstadisticasFilters.js";

const CHUNK = 40;
const MAX_SERVICIOS = 500;
const TOP_N = 5;
const PAGE_SIZE = 50;

const TERMINAL_ESTADOS = new Set(["completado", "cerrado", "anulado", "cancelado"]);

function norm(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function chunkIds(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

function parseNum(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function servicioFecha(servicio) {
  const raw = servicio?.fecha_inicio || servicio?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function muelleMinutes(stop) {
  const a = stop?.hora_llegada_real;
  const b = stop?.hora_salida_real;
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return Number.isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
}

function pickPrimaryCmr(cmrList) {
  const rows = Array.isArray(cmrList) ? cmrList : [];
  if (!rows.length) return null;
  const withNum = rows.find((r) => String(r?.datos?.num_cmr || "").trim());
  return withNum || rows[0];
}

function cmrHasGeo(evidencia) {
  const geo = evidencia?.datos?.doc_meta?.geo;
  return !!(geo && (geo.lat != null || geo.lng != null || geo.latitude != null));
}

function countTop(map, key, n = TOP_N) {
  const entries = [...map.entries()]
    .filter(([k]) => k && k !== "—")
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  return entries.map(([label, count]) => ({ label, count }));
}

async function fetchInChunks(pathBuilder, ids) {
  const all = [];
  for (const slice of chunkIds(ids)) {
    const r = await sbFetch(pathBuilder(slice));
    if (!r.ok) continue;
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows)) all.push(...rows);
  }
  return all;
}

export async function fetchServiciosForEstadisticas(empresaId, fechaDesde, fechaHasta) {
  if (!empresaId || !fechaDesde || !fechaHasta) return [];
  const gte = startOfDayIso(fechaDesde);
  const lte = endOfDayIso(fechaHasta);
  const r = await sbFetch(
    `/rest/v1/servicios?empresa_id=eq.${empresaId}&created_at=gte.${encodeURIComponent(gte)}&created_at=lte.${encodeURIComponent(lte)}&order=created_at.desc&limit=${MAX_SERVICIOS}&select=id,empresa_id,conductor_id,responsable_user_id,referencia,origen,destino,estado,fecha_inicio,created_at,cliente,cliente_nombre`,
  );
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export async function fetchConductoresForEstadisticas(sbSelectFn, empresaId) {
  if (!empresaId || !sbSelectFn) return [];
  try {
    const rels = await sbSelectFn("conductor_empresa", `empresa_id=eq.${empresaId}&activo=eq.true`);
    const out = [];
    for (const rel of Array.isArray(rels) ? rels : []) {
      if (!rel?.user_id) continue;
      const pr = await sbSelectFn("profiles", `id=eq.${rel.user_id}&select=id,nombre,is_archived`);
      if (pr?.[0]?.is_archived) continue;
      out.push({
        user_id: rel.user_id,
        nombre: pr?.[0]?.nombre || rel.nombre || "Conductor",
      });
    }
    return out;
  } catch (_) {
    return [];
  }
}

export async function loadEstadisticasRawData({ empresaId, fechaDesde, fechaHasta, sbSelectFn }) {
  const servicios = await fetchServiciosForEstadisticas(empresaId, fechaDesde, fechaHasta);
  const servicioIds = servicios.map((s) => s.id).filter(Boolean);
  if (!servicioIds.length) {
    return {
      servicios: [],
      stops: [],
      evidencias: [],
      incidencias: [],
      extraDocs: [],
      enviosByServicio: {},
      conductores: await fetchConductoresForEstadisticas(sbSelectFn, empresaId),
    };
  }

  const [stops, incidencias, extraDocs, enviosByServicio, conductores] = await Promise.all([
    fetchInChunks(
      (slice) =>
        `/rest/v1/stops?servicio_id=in.(${slice.join(",")})&select=id,servicio_id,tipo,nombre,hora_llegada_real,hora_salida_real,orden`,
      servicioIds,
    ),
    fetchInChunks(
      (slice) =>
        `/rest/v1/incidencias?empresa_id=eq.${empresaId}&servicio_id=in.(${slice.join(",")})&select=id,servicio_id,fase_operativa,titulo,registrado_en,created_at`,
      servicioIds,
    ),
    fetchInChunks(
      (slice) =>
        `/rest/v1/servicio_documentos_extra?servicio_id=in.(${slice.join(",")})&select=id,servicio_id,tipo,created_at`,
      servicioIds,
    ),
    fetchLatestDocumentacionEnvioByServicioIds(servicioIds).catch(() => ({})),
    fetchConductoresForEstadisticas(sbSelectFn, empresaId),
  ]);

  const stopIds = stops.map((s) => s.id).filter(Boolean);
  const evidencias = stopIds.length
    ? await fetchInChunks(
        (slice) =>
          `/rest/v1/evidencias?stop_id=in.(${slice.join(",")})&select=id,stop_id,tipo,datos,created_at`,
        stopIds,
      )
    : [];

  return { servicios, stops, evidencias, incidencias, extraDocs, enviosByServicio, conductores };
}

export function buildServicioEstadisticaRows(raw, { officeUser, uid, conductorByUid = {} }) {
  const servicios = filterServiciosForOfficeUser(raw?.servicios || [], officeUser, uid, { forEstadisticas: true });
  const stopsByServicio = {};
  for (const st of raw?.stops || []) {
    if (!st?.servicio_id) continue;
    if (!stopsByServicio[st.servicio_id]) stopsByServicio[st.servicio_id] = [];
    stopsByServicio[st.servicio_id].push(st);
  }

  const stopToServicio = {};
  for (const st of raw?.stops || []) {
    if (st?.id && st?.servicio_id) stopToServicio[st.id] = st.servicio_id;
  }

  const evidenciasByServicio = {};
  for (const ev of raw?.evidencias || []) {
    const sid = stopToServicio[ev?.stop_id];
    if (!sid) continue;
    if (!evidenciasByServicio[sid]) evidenciasByServicio[sid] = [];
    evidenciasByServicio[sid].push(ev);
  }

  const incidenciasByServicio = {};
  for (const inc of raw?.incidencias || []) {
    if (!inc?.servicio_id) continue;
    if (!incidenciasByServicio[inc.servicio_id]) incidenciasByServicio[inc.servicio_id] = [];
    incidenciasByServicio[inc.servicio_id].push(inc);
  }

  const extraByServicio = {};
  for (const doc of raw?.extraDocs || []) {
    if (!doc?.servicio_id) continue;
    if (!extraByServicio[doc.servicio_id]) extraByServicio[doc.servicio_id] = [];
    extraByServicio[doc.servicio_id].push(doc);
  }

  const envios = raw?.enviosByServicio || {};

  return servicios.map((servicio) => {
    const sid = servicio.id;
    const stops = stopsByServicio[sid] || [];
    const evs = evidenciasByServicio[sid] || [];
    const cmrEvs = evs.filter((e) => norm(e?.tipo) === "cmr");
    const incs = incidenciasByServicio[sid] || [];
    const extras = extraByServicio[sid] || [];
    const cmr = pickPrimaryCmr(cmrEvs);
    const datos = cmr?.datos || {};
    const { origen, destino } = resolveServiceRouteEndpoints(servicio, stops);
    const cliente = getServiceClient(servicio) || "—";
    const referencia = getServiceNumberForDisplay(servicio) || "—";
    const conductorId = servicio?.conductor_id || "";
    const conductorNombre = conductorByUid[conductorId]?.nombre || (conductorId ? "Conductor" : "—");
    const pesoKg = parseNum(datos?.peso_kg);
    const bultos = parseNum(datos?.bultos);
    const muelleTotal = stops.reduce((acc, st) => acc + (muelleMinutes(st) || 0), 0);
    const muelleCount = stops.filter((st) => muelleMinutes(st) != null).length;
    const envioRow = envios[sid] || null;
    const envioEstado = resolveEnvioClienteEstado(envioRow?.estado);
    const docTipos = [
      ...new Set([
        ...evs.map((e) => e?.tipo).filter(Boolean),
        ...extras.map((d) => d?.tipo).filter(Boolean),
      ]),
    ];
    const fasesInc = [...new Set(incs.map((i) => i?.fase_operativa).filter(Boolean))];
    const hasCmr = cmrEvs.length > 0;
    const hasDocs = evs.length > 0 || extras.length > 0;
    const docCompleta = hasCmr && ["enviado", "simulado"].includes(norm(envioRow?.estado));

    return {
      servicioId: sid,
      fechaServicio: servicioFecha(servicio),
      fechaServicioLabel: servicioFecha(servicio)
        ? servicioFecha(servicio).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
        : "—",
      referencia,
      cliente,
      origen: origen || "—",
      destino: destino || "—",
      conductorId,
      conductorNombre,
      estado: servicio?.estado || "",
      estadoLabel: ESTADO_LABEL[servicio?.estado] || servicio?.estado || "—",
      numCmr: String(datos?.num_cmr || "").trim() || "—",
      remitente: String(datos?.remitente || "").trim() || "—",
      destinatario: String(datos?.destinatario || "").trim() || "—",
      transportista: String(datos?.transportista || "").trim() || "—",
      lugarCargaCmr: String(datos?.lugar_carga || "").trim() || "—",
      lugarEntregaCmr: String(datos?.lugar_entrega || "").trim() || "—",
      mercancia: String(datos?.mercancia || "").trim() || "—",
      pesoKg,
      bultos,
      matricula: String(datos?.matricula || "").trim() || "—",
      incidenciasCount: incs.length,
      documentosCount: evs.length + extras.length,
      tiempoMuelleMinutos: muelleCount ? muelleTotal : null,
      documentacionEnviada: !!envioRow && ["enviado", "simulado"].includes(norm(envioRow?.estado)),
      estadoEnvioDocumentacion: envioEstado.label,
      estadoEnvioRaw: envioRow?.estado || "",
      hasCmr,
      hasIncidencias: incs.length > 0,
      hasDocumentos: hasDocs,
      docCompleta,
      docIncompleta: TERMINAL_ESTADOS.has(norm(servicio?.estado)) && !docCompleta,
      docTipos,
      fasesInc,
      cmrEvs,
      cmrConNumero: cmrEvs.some((e) => String(e?.datos?.num_cmr || "").trim()),
      cmrConGeo: cmrEvs.some(cmrHasGeo),
      cmrSinNumero: cmrEvs.length > 0 && !cmrEvs.some((e) => String(e?.datos?.num_cmr || "").trim()),
      cmrSinGeo: cmrEvs.length > 0 && !cmrEvs.some(cmrHasGeo),
      sinConductor: !servicio?.conductor_id,
    };
  });
}

export function applyEstadisticasFilters(rows, filters) {
  const list = Array.isArray(rows) ? rows : [];
  const f = filters || {};
  return list.filter((row) => {
    if (f.cliente && norm(row.cliente) !== norm(f.cliente)) return false;
    if (f.conductorId && row.conductorId !== f.conductorId) return false;
    if (f.estadoServicio && norm(row.estado) !== norm(f.estadoServicio)) return false;
    if (f.origen && !norm(row.origen).includes(norm(f.origen))) return false;
    if (f.destino && !norm(row.destino).includes(norm(f.destino))) return false;
    if (f.tipoDocumento && !row.docTipos.map(norm).includes(norm(f.tipoDocumento))) return false;
    if (f.tipoIncidencia && !row.fasesInc.map(norm).includes(norm(f.tipoIncidencia))) return false;
    if (f.remitenteCmr && !norm(row.remitente).includes(norm(f.remitenteCmr))) return false;
    if (f.destinatarioCmr && !norm(row.destinatario).includes(norm(f.destinatarioCmr))) return false;
    if (f.mercanciaCmr && !norm(row.mercancia).includes(norm(f.mercanciaCmr))) return false;
    if (f.matricula && !norm(row.matricula).includes(norm(f.matricula))) return false;
    if (f.conCmr === "si" && !row.hasCmr) return false;
    if (f.conCmr === "no" && row.hasCmr) return false;
    if (f.conIncidencias === "si" && !row.hasIncidencias) return false;
    if (f.conIncidencias === "no" && row.hasIncidencias) return false;
    if (f.conDocumentos === "si" && !row.hasDocumentos) return false;
    if (f.conDocumentos === "no" && row.hasDocumentos) return false;
    return true;
  });
}

export function buildFilterOptions(rows, conductores = []) {
  const clientes = new Set();
  const origenes = new Set();
  const destinos = new Set();
  const docTipos = new Set();
  const fasesInc = new Set();
  const estados = new Set();

  for (const row of rows || []) {
    if (row.cliente && row.cliente !== "—") clientes.add(row.cliente);
    if (row.origen && row.origen !== "—") origenes.add(row.origen);
    if (row.destino && row.destino !== "—") destinos.add(row.destino);
    for (const t of row.docTipos || []) docTipos.add(t);
    for (const f of row.fasesInc || []) fasesInc.add(f);
    if (row.estado) estados.add(row.estado);
  }

  return {
    clientes: [...clientes].sort((a, b) => a.localeCompare(b, "es")),
    conductores: (conductores || []).map((c) => ({ id: c.user_id, nombre: c.nombre })),
    origenes: [...origenes].sort((a, b) => a.localeCompare(b, "es")),
    destinos: [...destinos].sort((a, b) => a.localeCompare(b, "es")),
    docTipos: [...docTipos].sort(),
    fasesInc: [...fasesInc].sort(),
    estados: SERVICIO_ESTADOS_DB.filter((e) => estados.has(e)),
  };
}

export function computeEstadisticasKpis(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.length;
  const completados = list.filter((r) => ["completado", "cerrado"].includes(norm(r.estado))).length;
  const enCurso = list.filter((r) => norm(r.estado) === "en_curso").length;
  const pendientes = list.filter((r) => ["pendiente_asignacion", "asignado"].includes(norm(r.estado))).length;
  const sinConductor = list.filter((r) => r.sinConductor).length;

  let cmrEscaneados = 0;
  let serviciosConCmr = 0;
  let serviciosSinCmr = 0;
  let documentosExtra = 0;
  let incidenciasTotal = 0;
  let serviciosConIncidencias = 0;
  let pesoTotal = 0;
  let serviciosConPeso = 0;
  let muelleSum = 0;
  let muelleCount = 0;
  let enviosDoc = 0;
  let enviosOk = 0;
  let enviosError = 0;

  for (const row of list) {
    cmrEscaneados += row.cmrEvs?.length || 0;
    if (row.hasCmr) serviciosConCmr += 1;
    else serviciosSinCmr += 1;
    documentosExtra += row.documentosCount || 0;
    incidenciasTotal += row.incidenciasCount || 0;
    if (row.hasIncidencias) serviciosConIncidencias += 1;
    if (row.pesoKg != null && row.pesoKg > 0) {
      pesoTotal += row.pesoKg;
      serviciosConPeso += 1;
    }
    if (row.tiempoMuelleMinutos != null) {
      muelleSum += row.tiempoMuelleMinutos;
      muelleCount += 1;
    }
    if (row.documentacionEnviada) enviosDoc += 1;
    const est = norm(row.estadoEnvioRaw);
    if (est === "enviado" || est === "simulado") enviosOk += 1;
    if (est === "error") enviosError += 1;
  }

  return {
    serviciosTotales: total,
    serviciosCompletados: completados,
    serviciosEnCurso: enCurso,
    serviciosPendientes: pendientes,
    serviciosSinConductor: sinConductor,
    cmrEscaneados,
    serviciosConCmr,
    serviciosSinCmr,
    documentosExtra,
    incidenciasRegistradas: incidenciasTotal,
    serviciosConIncidencias,
    pesoTotalKg: Math.round(pesoTotal * 10) / 10,
    pesoMedioKg: serviciosConPeso ? Math.round((pesoTotal / serviciosConPeso) * 10) / 10 : 0,
    tiempoMedioMuelleMin: muelleCount ? Math.round(muelleSum / muelleCount) : 0,
    enviosDocumentacion: enviosDoc,
    enviosCorrectos: enviosOk,
    enviosConError: enviosError,
  };
}

export function computeEstadisticasRankings(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byCliente = new Map();
  const incByCliente = new Map();
  const remitentes = new Map();
  const destinatarios = new Map();
  const mercancias = new Map();
  const matriculas = new Map();
  const incByFase = new Map();
  const byEstado = new Map();
  const byDocTipo = new Map();
  let cmrConNum = 0;
  let cmrSinNum = 0;
  let cmrConGeo = 0;
  let cmrSinGeo = 0;
  let docCompleta = 0;
  let docIncompleta = 0;

  for (const row of list) {
    byCliente.set(row.cliente, (byCliente.get(row.cliente) || 0) + 1);
    if (row.hasIncidencias) incByCliente.set(row.cliente, (incByCliente.get(row.cliente) || 0) + 1);
    if (row.remitente !== "—") remitentes.set(row.remitente, (remitentes.get(row.remitente) || 0) + 1);
    if (row.destinatario !== "—") destinatarios.set(row.destinatario, (destinatarios.get(row.destinatario) || 0) + 1);
    if (row.mercancia !== "—") mercancias.set(row.mercancia, (mercancias.get(row.mercancia) || 0) + 1);
    if (row.matricula !== "—") matriculas.set(row.matricula, (matriculas.get(row.matricula) || 0) + 1);
    for (const f of row.fasesInc || []) incByFase.set(f, (incByFase.get(f) || 0) + 1);
    byEstado.set(row.estadoLabel, (byEstado.get(row.estadoLabel) || 0) + 1);
    for (const t of row.docTipos || []) byDocTipo.set(t, (byDocTipo.get(t) || 0) + 1);
    if (row.cmrConNumero) cmrConNum += 1;
    if (row.cmrSinNumero) cmrSinNum += 1;
    if (row.cmrConGeo) cmrConGeo += 1;
    if (row.cmrSinGeo) cmrSinGeo += 1;
    if (row.docCompleta) docCompleta += 1;
    if (row.docIncompleta) docIncompleta += 1;
  }

  return {
    topClientesServicios: countTop(byCliente),
    topClientesIncidencias: countTop(incByCliente),
    topRemitentesCmr: countTop(remitentes),
    topDestinatariosCmr: countTop(destinatarios),
    topMercanciasCmr: countTop(mercancias),
    topMatriculasCmr: countTop(matriculas),
    incidenciasPorFase: countTop(incByFase),
    serviciosPorEstado: countTop(byEstado),
    documentosPorTipo: countTop(byDocTipo),
    cmrConNumero: cmrConNum,
    cmrSinNumero: cmrSinNum,
    cmrConGeo: cmrConGeo,
    cmrSinGeo: cmrSinGeo,
    docCompleta,
    docIncompleta,
  };
}

export function sortEstadisticasTable(rows, sortKey = "fecha", sortDir = "desc") {
  const list = [...(rows || [])];
  const dir = sortDir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    switch (sortKey) {
      case "cliente":
        return dir * String(a.cliente).localeCompare(String(b.cliente), "es");
      case "peso":
        return dir * ((a.pesoKg || 0) - (b.pesoKg || 0));
      case "incidencias":
        return dir * ((a.incidenciasCount || 0) - (b.incidenciasCount || 0));
      case "fecha":
      default: {
        const ta = a.fechaServicio?.getTime?.() || 0;
        const tb = b.fechaServicio?.getTime?.() || 0;
        return dir * (ta - tb);
      }
    }
  });
  return list;
}

export function filterTableSearch(rows, q) {
  const query = norm(q);
  if (!query) return rows || [];
  return (rows || []).filter((row) => {
    const blob = [
      row.referencia,
      row.cliente,
      row.origen,
      row.destino,
      row.conductorNombre,
      row.estadoLabel,
      row.numCmr,
      row.remitente,
      row.destinatario,
      row.mercancia,
      row.matricula,
    ]
      .map(norm)
      .join(" ");
    return blob.includes(query);
  });
}

export function paginateRows(rows, page = 1, pageSize = PAGE_SIZE) {
  const list = rows || [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: list.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    totalRows: list.length,
    pageSize,
  };
}

export function buildEstadisticasCsv(rows) {
  const header = [
    "fecha_servicio",
    "referencia",
    "cliente",
    "origen",
    "destino",
    "conductor",
    "estado",
    "num_cmr",
    "remitente",
    "destinatario",
    "transportista",
    "lugar_carga_cmr",
    "lugar_entrega_cmr",
    "mercancia",
    "peso_kg",
    "bultos",
    "matricula",
    "incidencias",
    "documentos",
    "tiempo_muelle_minutos",
    "documentacion_enviada",
    "estado_envio_documentacion",
  ];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const row of rows || []) {
    lines.push(
      [
        row.fechaServicio ? toCsvDate(row.fechaServicio) : "",
        row.referencia,
        row.cliente,
        row.origen,
        row.destino,
        row.conductorNombre,
        row.estadoLabel,
        row.numCmr === "—" ? "" : row.numCmr,
        row.remitente === "—" ? "" : row.remitente,
        row.destinatario === "—" ? "" : row.destinatario,
        row.transportista === "—" ? "" : row.transportista,
        row.lugarCargaCmr === "—" ? "" : row.lugarCargaCmr,
        row.lugarEntregaCmr === "—" ? "" : row.lugarEntregaCmr,
        row.mercancia === "—" ? "" : row.mercancia,
        row.pesoKg ?? "",
        row.bultos ?? "",
        row.matricula === "—" ? "" : row.matricula,
        row.incidenciasCount,
        row.documentosCount,
        row.tiempoMuelleMinutos ?? "",
        row.documentacionEnviada ? "si" : "no",
        row.estadoEnvioDocumentacion,
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

function toCsvDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export function downloadCsv(content, filename = "estadisticas_operativas.csv") {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ESTADISTICAS_PAGE_SIZE = PAGE_SIZE;
