import { sbFetch } from "../../data/supabaseClient.js";
import { getStopOperacionMeta } from "../service/stopOperacionMeta.js";
import { operationalGroupFromStopTipo } from "../service/tripOperationalDossier.js";
import { getFixedServiceRoute } from "../service/serviceIdentity.js";
import { resolveParteFields, suggestParteTipoForStop } from "./partesTransporteModel.js";
import {
  DCDT_ESTADO,
  DCDT_REQUIRED_FIELDS,
  DCDT_TABLE,
  DCDT_TABLE_LEGACY,
} from "./dcdtConstants.js";

const COLS = "id,servicio_id,empresa_id,estado,datos,validado_por,validado_at,pdf_generado_at,updated_at";

function emptyDatos() {
  return {
    partes: {
      cargador_id: null,
      cargador_overrides: {},
      destinatario_id: null,
      destinatario_overrides: {},
    },
    mercancia: { descripcion: null, peso_kg: null, bultos: null, palets: null },
    transportista: { use_empresa: true },
    vehiculo: { use_conductor_matricula: true, matricula_override: null },
    stops: [],
    ocr_ultimo: null,
    observaciones: "",
  };
}

function rowToDcdt(row) {
  if (!row) return null;
  const datos = row.datos && typeof row.datos === "object" ? row.datos : emptyDatos();
  return {
    id: row.id,
    servicioId: row.servicio_id,
    empresaId: row.empresa_id,
    estado: row.estado || DCDT_ESTADO.BORRADOR,
    datos: { ...emptyDatos(), ...datos, partes: { ...emptyDatos().partes, ...(datos.partes || {}) } },
    validadoPor: row.validado_por,
    validadoAt: row.validado_at,
    pdfGeneradoAt: row.pdf_generado_at,
    updatedAt: row.updated_at,
  };
}

function getNested(obj, path) {
  return path.split(".").reduce((o, k) => (o && o[k] != null ? o[k] : null), obj);
}

async function dcdtRequest(path, init) {
  let r = await sbFetch(`/rest/v1/${DCDT_TABLE}${path}`, init);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (/42P01|PGRST205|dcdt_servicio/i.test(body)) {
      r = await sbFetch(`/rest/v1/${DCDT_TABLE_LEGACY}${path}`, init);
    }
  }
  return r;
}

export function buildStopBindingsFromStops(stops) {
  return (stops || []).map((st) => {
    const meta = getStopOperacionMeta(st?.notas);
    const group = operationalGroupFromStopTipo(st.tipo);
    return {
      stop_id: st.id,
      orden: st.orden,
      tipo: st.tipo,
      grupo: group,
      parte_id: meta.parte_transporte_id || null,
      parte_tipo: meta.parte_transporte_tipo || suggestParteTipoForStop(st.tipo),
    };
  });
}

export function syncParteIdsFromStops(datos, stops) {
  const out = { ...datos, partes: { ...datos.partes } };
  out.stops = buildStopBindingsFromStops(stops);
  for (const b of out.stops) {
    if (!b.parte_id) continue;
    if (b.grupo === "carga" && !out.partes.cargador_id) out.partes.cargador_id = b.parte_id;
    if (b.grupo === "descarga" && !out.partes.destinatario_id) out.partes.destinatario_id = b.parte_id;
  }
  return out;
}

/** Resuelve documento DCDT para UI/PDF sin duplicar master. */
export function resolveDcdtDocument({
  servicio,
  stops = [],
  dcdt,
  masterById = {},
  empresa = null,
  conductor = null,
}) {
  const datos = syncParteIdsFromStops(dcdt?.datos || emptyDatos(), stops);
  const partes = datos.partes || {};

  const cargador = resolveParteFields(masterById[partes.cargador_id], partes.cargador_overrides);
  const destinatario = resolveParteFields(
    masterById[partes.destinatario_id],
    partes.destinatario_overrides,
  );

  const transportista = {
    nombre: empresa?.nombre || "",
    nif: empresa?.cif || "",
    domicilio: empresa?.direccion || "",
  };

  let matricula = datos.vehiculo?.matricula_override || null;
  if (!matricula && datos.vehiculo?.use_conductor_matricula !== false) {
    matricula = conductor?.matricula || null;
  }

  const route = getFixedServiceRoute(servicio, "—", "—", stops);
  const fecha = servicio?.fecha_inicio || servicio?.created_at || null;

  const doc = {
    referencia: servicio?.referencia || servicio?.id,
    cargador,
    destinatario,
    transportista,
    origen: route.origen || servicio?.origen || "",
    destino: route.destino || servicio?.destino || "",
    mercancia: {
      descripcion: datos.mercancia?.descripcion || null,
      peso_kg: datos.mercancia?.peso_kg ?? null,
      bultos: datos.mercancia?.bultos ?? null,
      palets: datos.mercancia?.palets ?? null,
    },
    fecha_transporte: fecha,
    vehiculo: { matricula },
    observaciones: datos.observaciones || "",
    validado_at: dcdt?.validadoAt || null,
    validado_por_label: null,
    estado: dcdt?.estado || DCDT_ESTADO.BORRADOR,
  };

  const missing = [];
  for (const f of DCDT_REQUIRED_FIELDS) {
    const val = getNested(doc, f.key);
    if (val == null || String(val).trim() === "") missing.push(f);
  }

  return { doc, missing, datos };
}

export function hasCmrEvidencias(evidenciasByStop) {
  for (const evs of Object.values(evidenciasByStop || {})) {
    if ((evs || []).some((ev) => ev?.tipo === "cmr")) return true;
  }
  return false;
}

export function computeDcdtEstado({ missing, evidenciasByStop, datos, currentEstado }) {
  if (
    currentEstado === DCDT_ESTADO.VALIDADO ||
    currentEstado === DCDT_ESTADO.EN_EXPEDIENTE
  ) {
    return currentEstado;
  }
  if (!missing.length) return DCDT_ESTADO.PENDIENTE_VALIDACION;
  const mercMissing = missing.some((f) => f.key.startsWith("mercancia"));
  if (mercMissing && hasCmrEvidencias(evidenciasByStop) && !datos?.ocr_ultimo) {
    return DCDT_ESTADO.PENDIENTE_OCR;
  }
  return DCDT_ESTADO.INCOMPLETO;
}

export function mergeOcrIntoDcdtDatos(datos, ocrFields) {
  if (!ocrFields || typeof ocrFields !== "object") return datos;
  const out = { ...datos, mercancia: { ...datos.mercancia }, partes: { ...datos.partes } };

  if (ocrFields.mercancia && !out.mercancia.descripcion) out.mercancia.descripcion = ocrFields.mercancia;
  if (ocrFields.peso_kg != null && out.mercancia.peso_kg == null) {
    out.mercancia.peso_kg = Number(ocrFields.peso_kg) || null;
  }
  if (ocrFields.bultos != null && out.mercancia.bultos == null) {
    out.mercancia.bultos = Number(ocrFields.bultos) || null;
  }
  if (ocrFields.matricula && !out.vehiculo?.matricula_override) {
    out.vehiculo = { ...out.vehiculo, matricula_override: ocrFields.matricula };
  }

  const patchNombre = (idKey, overridesKey, nombre) => {
    if (!nombre || out.partes[idKey]) return;
    out.partes[overridesKey] = {
      ...(out.partes[overridesKey] || {}),
      nombre: out.partes[overridesKey]?.nombre || nombre,
    };
  };
  patchNombre("cargador_id", "cargador_overrides", ocrFields.remitente);
  patchNombre("destinatario_id", "destinatario_overrides", ocrFields.destinatario);

  out.ocr_ultimo = { at: new Date().toISOString(), campos: ocrFields };
  return out;
}

export function extractLatestOcrFromEvidencias(evidenciasByStop) {
  let latest = null;
  let latestTs = 0;
  for (const evs of Object.values(evidenciasByStop || {})) {
    for (const ev of evs || []) {
      if (ev?.tipo !== "cmr" || !ev?.datos) continue;
      const ts = new Date(ev.created_at || 0).getTime();
      if (ts >= latestTs) {
        latestTs = ts;
        latest = ev.datos;
      }
    }
  }
  return latest;
}

export function dcdtDocForExpediente(doc, meta = {}) {
  if (!doc) return null;
  return {
    titulo: "Documento de Control del Transporte",
    subtitulo: "DCDT — Orden FOM/2861/2012",
    referencia: doc.referencia,
    cargador: doc.cargador,
    transportista: doc.transportista,
    destinatario: doc.destinatario,
    origen: doc.origen,
    destino: doc.destino,
    mercancia: doc.mercancia,
    fecha_transporte: doc.fecha_transporte,
    vehiculo: doc.vehiculo,
    observaciones: doc.observaciones,
    validado_at: meta.validadoAt || doc.validado_at,
    estado: meta.estado,
  };
}

export async function fetchDcdtByServicio(servicioId) {
  const r = await dcdtRequest(`?servicio_id=eq.${servicioId}&select=${COLS}&limit=1`);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (/dcdt_servicio|carta_porte|42P01|PGRST205/i.test(body)) return null;
    throw new Error("No se pudo cargar DCDT");
  }
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export async function ensureDcdtForServicio({ servicioId, empresaId, stops = [] }) {
  let row = await fetchDcdtByServicio(servicioId);
  if (row) return row;
  const datos = syncParteIdsFromStops(emptyDatos(), stops);
  const r = await dcdtRequest("", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      servicio_id: servicioId,
      empresa_id: empresaId,
      estado: DCDT_ESTADO.BORRADOR,
      datos,
    }),
  });
  if (!r.ok) throw new Error("No se pudo inicializar DCDT");
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export async function saveDcdtDatos(id, datos, estado = null) {
  const body = { datos, updated_at: new Date().toISOString() };
  if (estado) body.estado = estado;
  const r = await dcdtRequest(`?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("No se pudo guardar DCDT");
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export async function validarDcdtTrafico(id, userId) {
  const r = await dcdtRequest(`?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      estado: DCDT_ESTADO.VALIDADO,
      validado_por: userId,
      validado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) throw new Error("No se pudo validar DCDT");
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export async function markDcdtIncluidoExpediente(id) {
  const r = await dcdtRequest(`?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      estado: DCDT_ESTADO.EN_EXPEDIENTE,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export async function markDcdtPdfGenerado(id) {
  const r = await dcdtRequest(`?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      pdf_generado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) throw new Error("No se pudo registrar PDF");
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export function isDcdtValidadoParaExpediente(dcdt) {
  const e = String(dcdt?.estado || "").toLowerCase();
  return e === DCDT_ESTADO.VALIDADO || e === DCDT_ESTADO.EN_EXPEDIENTE;
}
