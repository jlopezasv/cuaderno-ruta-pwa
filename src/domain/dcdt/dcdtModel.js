import { sbFetch } from "../../data/supabaseClient.js";
import { getStopOperacionMeta } from "../service/stopOperacionMeta.js";
import { operationalGroupFromStopTipo } from "../service/tripOperationalDossier.js";
import { getServiceNumberForDisplay, resolveServiceRouteEndpoints } from "../service/serviceIdentity.js";
import { resolveParteFields, suggestParteTipoForStop } from "./partesTransporteModel.js";
import { formatDcdtDisplayValue } from "./dcdtDisplayText.js";
import {
  DECA_FULL_TITLE,
  DECA_LEGAL_REF,
  DECA_SHORT_LABEL,
  DECA_TITLE_WITH_LEGAL,
} from "./decaBranding.js";
import {
  DCDT_ESTADO,
  DCDT_REQUIRED_FIELDS,
  DCDT_TABLE,
  DCDT_TABLE_LEGACY,
} from "./dcdtConstants.js";
import { buildDcdtVerifySnapshot } from "./dcdtVerifyPayload.js";
import { generateDcdtVerifyToken, isDcdtQrEligible } from "./dcdtVerifyToken.js";
import { resolveTransportistaDcdt } from "./empresaTransportistaDcdt.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { buildDecaPreStartGapMeta, shouldWarnDecaMissingBeforeStart } from "./decaPreStartCompliance.js";
import {
  shouldMarkPdfStaleOnDatosSave,
  withPdfStaleFlags,
} from "./decaPdfStale.js";
import { mercanciaDatosFromCargaStops } from "./stopMercanciaMeta.js";
import { isDecaAplicable } from "../service/servicioAlcance.js";

export { buildMercanciaDatosPatch, mercanciaEditFromDatos } from "./mercanciaPatch.js";

const COLS_CORE =
  "id,servicio_id,empresa_id,estado,datos,validado_por,validado_at,pdf_generado_at,fecha_inicio_efectivo,created_at,updated_at";
const COLS = `${COLS_CORE},deca_public_id`;

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
    decaPublicId: row.deca_public_id || datos.deca_public_id || null,
    fechaInicioEfectivo: row.fecha_inicio_efectivo || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getNested(obj, path) {
  return path.split(".").reduce((o, k) => (o && o[k] != null ? o[k] : null), obj);
}

function responseWithText(original, bodyText) {
  return new Response(bodyText, {
    status: original.status,
    statusText: original.statusText,
    headers: original.headers,
  });
}

async function dcdtRequest(path, init) {
  let r = await sbFetch(`/rest/v1/${DCDT_TABLE}${path}`, init);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    const legacyTableMissing =
      /42P01|PGRST205/i.test(body) || /relation .* does not exist/i.test(body);
    if (legacyTableMissing) {
      r = await sbFetch(`/rest/v1/${DCDT_TABLE_LEGACY}${path}`, init);
    } else {
      return responseWithText(r, body);
    }
  }
  return r;
}

async function dcdtSelectFirst(filterQuery) {
  for (const cols of [COLS, COLS_CORE]) {
    const r = await dcdtRequest(`${filterQuery}&select=${cols}&limit=1`);
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
    }
    const body = await r.text().catch(() => "");
    if (!/deca_public_id|PGRST204|42703/i.test(body)) break;
  }
  return null;
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
      parte_id: meta.parte_transporte_id || st.parte_transporte_id || null,
      parte_tipo: meta.parte_transporte_tipo || suggestParteTipoForStop(st.tipo),
    };
  });
}

export function syncParteIdsFromStops(datos, stops, options = {}) {
  const { cargadorId = null, destinatarioId = null } = options;
  const out = { ...datos, partes: { ...(datos?.partes || {}) } };
  out.stops = buildStopBindingsFromStops(stops);
  if (cargadorId) {
    out.partes.cargador_id = cargadorId;
  } else {
    for (const b of out.stops) {
      if (!b.parte_id) continue;
      if (b.grupo === "carga") out.partes.cargador_id = b.parte_id;
    }
  }
  if (destinatarioId) {
    out.partes.destinatario_id = destinatarioId;
  } else {
    for (const b of out.stops) {
      if (!b.parte_id) continue;
      if (b.grupo === "descarga") out.partes.destinatario_id = b.parte_id;
    }
  }
  return out;
}

/** Catálogo DCDT (partes.*_id guardados) prima sobre sync automático desde paradas. */
function mergeDcdtPartesPersisted(persistedPartes = {}, syncedPartes = {}) {
  return {
    ...syncedPartes,
    cargador_id: persistedPartes.cargador_id ?? syncedPartes.cargador_id ?? null,
    destinatario_id: persistedPartes.destinatario_id ?? syncedPartes.destinatario_id ?? null,
    cargador_overrides: {
      ...(syncedPartes.cargador_overrides || {}),
      ...(persistedPartes.cargador_overrides || {}),
    },
    destinatario_overrides: {
      ...(syncedPartes.destinatario_overrides || {}),
      ...(persistedPartes.destinatario_overrides || {}),
    },
  };
}

function dcdtPartesEquivalent(beforeDatos, afterDatos) {
  const a = beforeDatos?.partes || {};
  const b = afterDatos?.partes || {};
  return (
    String(a.cargador_id ?? "") === String(b.cargador_id ?? "") &&
    String(a.destinatario_id ?? "") === String(b.destinatario_id ?? "")
  );
}

function parseMercanciaNorm(m) {
  const parseNum = (v) => {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  return {
    descripcion: String(m?.descripcion ?? "").trim() || null,
    peso_kg: parseNum(m?.peso_kg),
    bultos: parseNum(m?.bultos),
    palets: parseNum(m?.palets),
  };
}

function mercanciaDatosEquivalent(a, b) {
  return JSON.stringify(parseMercanciaNorm(a)) === JSON.stringify(parseMercanciaNorm(b));
}

function validacionSnapshotContentEquivalent(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const stripAt = (snap) => {
    if (!snap || typeof snap !== "object") return snap;
    const { at: _at, ...rest } = snap;
    return rest;
  };
  return JSON.stringify(stripAt(a)) === JSON.stringify(stripAt(b));
}

/** Sincroniza cargador/destinatario/mercancía desde paradas y persiste si cambió. */
export async function persistDcdtPartesFromStops({
  dcdt,
  servicio,
  stops = [],
  cargadorId = null,
  flotaEvs = {},
  empresa = null,
  conductor = null,
  masterById = {},
  skipPdfStale = false,
}) {
  if (!dcdt?.id) return dcdt;
  const effectiveCargadorId = cargadorId || dcdt?.datos?.partes?.cargador_id || null;
  const syncedDatos = syncParteIdsFromStops(dcdt.datos, stops, {
    cargadorId: effectiveCargadorId,
  });
  syncedDatos.mercancia = mercanciaDatosFromCargaStops(stops, effectiveCargadorId);
  if (
    dcdtPartesEquivalent(dcdt.datos, syncedDatos) &&
    mercanciaDatosEquivalent(dcdt.datos?.mercancia, syncedDatos.mercancia)
  ) {
    return dcdt;
  }
  const { doc, missing } = resolveDcdtDocument({
    servicio,
    stops,
    dcdt: { ...dcdt, datos: syncedDatos },
    masterById,
    empresa,
    conductor,
  });
  const datosToSave = { ...syncedDatos };
  if (isDcdtEstadoValidated(dcdt.estado)) {
    const nextSnap = buildValidacionSnapshot(doc);
    const prevSnap = dcdt.datos?.validacion_snapshot;
    if (validacionSnapshotContentEquivalent(prevSnap, nextSnap)) {
      datosToSave.validacion_snapshot = prevSnap;
    } else {
      datosToSave.validacion_snapshot = nextSnap;
    }
  }
  if (
    dcdtPartesEquivalent(dcdt.datos, datosToSave) &&
    mercanciaDatosEquivalent(dcdt.datos?.mercancia, datosToSave.mercancia) &&
    (!isDcdtEstadoValidated(dcdt.estado) ||
      validacionSnapshotContentEquivalent(dcdt.datos?.validacion_snapshot, datosToSave.validacion_snapshot))
  ) {
    return dcdt;
  }
  const estado = computeDcdtEstado({
    missing,
    evidenciasByStop: flotaEvs,
    datos: datosToSave,
    currentEstado: dcdt.estado,
  });
  if (estado === dcdt.estado && skipPdfStale) {
    return saveDcdtDatos(dcdt.id, datosToSave, null, { skipPdfStale: true });
  }
  return saveDcdtDatos(dcdt.id, datosToSave, estado, { skipPdfStale });
}

export async function assignDcdtParte({
  dcdt,
  role,
  parteId,
  servicio,
  stops = [],
  flotaEvs = {},
  empresa = null,
  conductor = null,
  masterById = {},
}) {
  if (!dcdt?.id || !parteId) throw new Error("Dato incompleto");
  const idKey = role === "cargador" ? "cargador_id" : "destinatario_id";
  const overrideKey = role === "cargador" ? "cargador_overrides" : "destinatario_overrides";
  const nextDatos = syncParteIdsFromStops(
    {
      ...dcdt.datos,
      partes: {
        ...(dcdt.datos?.partes || {}),
        [idKey]: parteId,
        [overrideKey]: {},
      },
    },
    stops,
  );
  nextDatos.partes[idKey] = parteId;
  const { missing } = resolveDcdtDocument({
    servicio,
    stops,
    dcdt: { ...dcdt, datos: nextDatos },
    masterById,
    empresa,
    conductor,
  });
  const estado = computeDcdtEstado({
    missing,
    evidenciasByStop: flotaEvs,
    datos: nextDatos,
    currentEstado: dcdt.estado,
  });
  return saveDcdtDatos(dcdt.id, nextDatos, estado);
}

function buildValidacionSnapshot(doc) {
  if (!doc) return null;
  return {
    at: new Date().toISOString(),
    referencia: doc.referencia,
    cargador: doc.cargador,
    destinatario: doc.destinatario,
    transportista: doc.transportista,
    origen: doc.origen,
    destino: doc.destino,
    mercancia: doc.mercancia,
    fecha_transporte: doc.fecha_transporte,
    vehiculo: doc.vehiculo,
  };
}

function dcdtFieldFilled(val) {
  return val != null && String(val).trim() !== "";
}

/** Prefer snapshot when tiene dato; si el snapshot quedó vacío (validación prematura), usar resolución viva. */
function mergeSnapshotParteBlock(snapParte, liveParte) {
  if (!snapParte && !liveParte) return liveParte;
  const pick = (key, altKey) => {
    const snapVal = snapParte?.[key] ?? (altKey ? snapParte?.[altKey] : null);
    const liveVal = liveParte?.[key] ?? (altKey ? liveParte?.[altKey] : null);
    if (dcdtFieldFilled(snapVal)) return snapVal;
    if (dcdtFieldFilled(liveVal)) return liveVal;
    return snapVal ?? liveVal ?? null;
  };
  return {
    nombre: pick("nombre"),
    nif: pick("nif"),
    domicilio: pick("domicilio", "direccion"),
  };
}

function mergeSnapshotScalar(snapVal, liveVal) {
  if (dcdtFieldFilled(snapVal)) return snapVal;
  if (dcdtFieldFilled(liveVal)) return liveVal;
  return snapVal ?? liveVal ?? null;
}

function mergeSnapshotMercancia(snapMerc, liveMerc) {
  if (!snapMerc && !liveMerc) return liveMerc;
  const pick = (key) => {
    const snapVal = snapMerc?.[key];
    const liveVal = liveMerc?.[key];
    if (snapVal != null && snapVal !== "") return snapVal;
    if (liveVal != null && liveVal !== "") return liveVal;
    return snapVal ?? liveVal ?? null;
  };
  return {
    descripcion: pick("descripcion"),
    peso_kg: pick("peso_kg"),
    bultos: pick("bultos"),
    palets: pick("palets"),
  };
}

function mergeSnapshotVehiculo(snapVeh, liveVeh) {
  if (!snapVeh && !liveVeh) return liveVeh;
  return {
    matricula: mergeSnapshotScalar(snapVeh?.matricula, liveVeh?.matricula),
    remolque: mergeSnapshotScalar(snapVeh?.remolque, liveVeh?.remolque),
  };
}

function validacionSnapshotParteIsEmpty(parte) {
  if (!parte || typeof parte !== "object") return true;
  return (
    !dcdtFieldFilled(parte.nombre) &&
    !dcdtFieldFilled(parte.nif) &&
    !dcdtFieldFilled(parte.domicilio) &&
    !dcdtFieldFilled(parte.direccion)
  );
}

export function isValidacionSnapshotStale(snap, doc) {
  if (!snap || !doc) return false;
  if (validacionSnapshotParteIsEmpty(snap.cargador) && !validacionSnapshotParteIsEmpty(doc.cargador)) return true;
  if (validacionSnapshotParteIsEmpty(snap.destinatario) && !validacionSnapshotParteIsEmpty(doc.destinatario)) {
    return true;
  }
  return false;
}

/** Repara snapshots validados con cargador/destinatario vacíos cuando el catálogo ya resuelve datos. */
export async function refreshValidacionSnapshotIfStale({ dcdt, doc, skipPdfStale = false } = {}) {
  if (!dcdt?.id || !isDcdtEstadoValidated(dcdt.estado)) return dcdt;
  const snap = dcdt.datos?.validacion_snapshot;
  if (!snap || !isValidacionSnapshotStale(snap, doc)) return dcdt;
  const nextSnap = buildValidacionSnapshot(doc);
  if (validacionSnapshotContentEquivalent(snap, nextSnap)) return dcdt;
  const datosToSave = { ...dcdt.datos, validacion_snapshot: nextSnap };
  return saveDcdtDatos(dcdt.id, datosToSave, dcdt.estado, { skipPdfStale });
}

function applyValidacionSnapshot(doc, dcdt) {
  const snap = dcdt?.datos?.validacion_snapshot;
  const mods = dcdt?.datos?.modificaciones_ruta;
  const withMods = {
    ...doc,
    modificaciones_ruta: Array.isArray(mods) ? mods : [],
  };
  // Paso 6b: tras modificación en ruta, el DeCA/PDF refleja datos vivos (no el snapshot congelado).
  if (Array.isArray(mods) && mods.length > 0) return withMods;
  if (!snap || !isDcdtEstadoValidated(dcdt?.estado)) return withMods;
  return {
    ...withMods,
    cargador: mergeSnapshotParteBlock(snap.cargador, doc.cargador),
    destinatario: mergeSnapshotParteBlock(snap.destinatario, doc.destinatario),
    transportista: mergeSnapshotParteBlock(snap.transportista, doc.transportista),
    origen: mergeSnapshotScalar(snap.origen, doc.origen),
    destino: mergeSnapshotScalar(snap.destino, doc.destino),
    mercancia: mergeSnapshotMercancia(snap.mercancia, doc.mercancia),
    fecha_transporte: mergeSnapshotScalar(snap.fecha_transporte, doc.fecha_transporte),
    vehiculo: mergeSnapshotVehiculo(snap.vehiculo, doc.vehiculo),
  };
}

/** Resuelve documento DCDT para UI/PDF sin duplicar master. */
export function resolveDcdtDocument({
  servicio,
  stops = [],
  dcdt,
  masterById = {},
  empresa = null,
  empresaOwnerProfile = null,
  conductor = null,
}) {
  const rawDatos = dcdt?.datos || emptyDatos();
  const syncedDatos = syncParteIdsFromStops(rawDatos, stops);
  const partes = mergeDcdtPartesPersisted(rawDatos.partes, syncedDatos.partes);
  const datos = { ...syncedDatos, partes };

  const cargador = resolveParteFields(masterById[partes.cargador_id], partes.cargador_overrides);
  const destinatario = resolveParteFields(
    masterById[partes.destinatario_id],
    partes.destinatario_overrides,
  );

  const transportista = resolveTransportistaDcdt(empresa, empresaOwnerProfile);

  let matricula = datos.vehiculo?.matricula_override || null;
  if (!matricula && datos.vehiculo?.use_conductor_matricula !== false) {
    matricula = conductor?.matricula || null;
  }
  let remolque = String(datos.vehiculo?.remolque_override || "").trim() || null;
  if (!remolque) remolque = String(conductor?.remolque || "").trim() || null;

  const routeEndpoints = resolveServiceRouteEndpoints(servicio, stops);
  const fecha = servicio?.fecha_inicio || servicio?.created_at || null;

  const doc = {
    referencia: getServiceNumberForDisplay(servicio) || "—",
    cargador,
    destinatario,
    transportista: {
      nombre: formatDcdtDisplayValue(transportista.nombre),
      nif: formatDcdtDisplayValue(transportista.nif),
      domicilio: formatDcdtDisplayValue(transportista.domicilio),
    },
    origen: formatDcdtDisplayValue(routeEndpoints.origen) || "—",
    destino: formatDcdtDisplayValue(routeEndpoints.destino) || "—",
    mercancia: {
      descripcion: formatDcdtDisplayValue(datos.mercancia?.descripcion) || null,
      peso_kg: datos.mercancia?.peso_kg ?? null,
      bultos: datos.mercancia?.bultos ?? null,
      palets: datos.mercancia?.palets ?? null,
    },
    fecha_transporte: fecha,
    vehiculo: { matricula: formatDcdtDisplayValue(matricula) || null, remolque },
    observaciones: formatDcdtDisplayValue(datos.observaciones) || "",
    validado_at: dcdt?.validadoAt || null,
    validado_por_label: null,
    estado: dcdt?.estado || DCDT_ESTADO.BORRADOR,
  };

  doc.cargador = {
    nombre: formatDcdtDisplayValue(cargador?.nombre),
    nif: formatDcdtDisplayValue(cargador?.nif),
    domicilio: formatDcdtDisplayValue(cargador?.domicilio || cargador?.direccion),
  };
  doc.destinatario = {
    nombre: formatDcdtDisplayValue(destinatario?.nombre),
    nif: formatDcdtDisplayValue(destinatario?.nif),
    domicilio: formatDcdtDisplayValue(destinatario?.domicilio || destinatario?.direccion),
  };

  const docFinal = applyValidacionSnapshot(doc, dcdt);

  const missing = [];
  for (const f of DCDT_REQUIRED_FIELDS) {
    const val = getNested(docFinal, f.key);
    if (val == null || String(val).trim() === "") missing.push(f);
  }

  return { doc: docFinal, missing, datos };
}

export function hasCmrEvidencias(evidenciasByStop) {
  for (const evs of Object.values(evidenciasByStop || {})) {
    if ((evs || []).some((ev) => ev?.tipo === "cmr")) return true;
  }
  return false;
}

export function computeDcdtEstado({ missing, evidenciasByStop, datos, currentEstado }) {
  if (missing.length > 0) {
    const mercMissing = missing.some((f) => f.key.startsWith("mercancia"));
    if (mercMissing && hasCmrEvidencias(evidenciasByStop) && !datos?.ocr_ultimo) {
      return DCDT_ESTADO.PENDIENTE_OCR;
    }
    return DCDT_ESTADO.INCOMPLETO;
  }
  if (
    currentEstado === DCDT_ESTADO.VALIDADO ||
    currentEstado === DCDT_ESTADO.EN_EXPEDIENTE
  ) {
    return currentEstado;
  }
  return DCDT_ESTADO.PENDIENTE_VALIDACION;
}

export function isDcdtEstadoValidated(estado) {
  const e = String(estado || "").toLowerCase();
  return e === DCDT_ESTADO.VALIDADO || e === DCDT_ESTADO.EN_EXPEDIENTE;
}

/** DCDT listo para validar / mostrar como validado: sin pendientes obligatorios. */
export function isDcdtFullyValidated({ estado, missing = [], validacionSnapshot = null, validadoAt = null }) {
  if (!isDcdtEstadoValidated(estado) || missing.length > 0) return false;
  const snap = validacionSnapshot && typeof validacionSnapshot === "object" ? validacionSnapshot : null;
  return Boolean(snap || validadoAt);
}

/** Etiqueta UX unificada empresa/conductor. */
export function dcdtStatusUxLabel({ estado, missing = [], pdfGeneradoAt = null }) {
  if (missing.length > 0) {
    const e = computeDcdtEstado({ missing, evidenciasByStop: {}, datos: {}, currentEstado: estado });
    if (e === DCDT_ESTADO.PENDIENTE_OCR) return `${DECA_SHORT_LABEL} pendiente OCR`;
    if (e === DCDT_ESTADO.PENDIENTE_VALIDACION) return `${DECA_SHORT_LABEL} completo — listo para validar`;
    return `${DECA_SHORT_LABEL} incompleto`;
  }
  if (!isDcdtEstadoValidated(estado)) return `${DECA_SHORT_LABEL} completo — listo para validar`;
  if (pdfGeneradoAt) return `${DECA_SHORT_LABEL} validado · PDF generado`;
  return `${DECA_SHORT_LABEL} validado`;
}

/** Rebaja estado validado si faltan campos obligatorios y persiste. */
export async function reconcileDcdtEstadoIfNeeded({ dcdt, missing, flotaEvs = {}, datos }) {
  if (!dcdt?.id) return dcdt;
  // DCDT validado con snapshot: no rebajar por datos temporales (conductor aún no cargado, etc.).
  if (isDcdtEstadoValidated(dcdt.estado) && dcdt.datos?.validacion_snapshot) {
    return dcdt;
  }
  const nextEstado = computeDcdtEstado({
    missing,
    evidenciasByStop: flotaEvs,
    datos: datos || dcdt.datos,
    currentEstado: dcdt.estado,
  });
  if (nextEstado === dcdt.estado) return dcdt;

  const downgrading = isDcdtEstadoValidated(dcdt.estado) && !isDcdtEstadoValidated(nextEstado);
  const patch = {
    estado: nextEstado,
    updated_at: new Date().toISOString(),
  };
  if (downgrading) {
    patch.validado_por = null;
    patch.validado_at = null;
    patch.datos = {
      ...dcdt.datos,
      qr_verificacion_token: null,
      qr_verificacion_snapshot: null,
    };
    if (isDemoApp()) {
      console.log("[DCDT estado] rebajando por pendientes", {
        dcdt_id: dcdt.id,
        from: dcdt.estado,
        to: nextEstado,
        missing: missing.map((m) => m.key),
      });
    }
  }

  const r = await dcdtRequest(`?id=eq.${dcdt.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) return dcdt;
  const rows = await r.json().catch(() => []);
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null) || dcdt;
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
    subtitulo: DECA_TITLE_WITH_LEGAL,
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

export function dcdtRowCargadorId(dcdt) {
  const id = dcdt?.datos?.partes?.cargador_id;
  return id != null && String(id).trim() !== "" ? String(id) : null;
}

/** Sin cargador y sin validar — fila vacía creada por ensure legacy. */
export function isDcdtOrphanRow(dcdt) {
  if (dcdtRowCargadorId(dcdt)) return false;
  return !isDcdtEstadoValidated(dcdt?.estado);
}

/** Oculta huérfanas en UI cuando ya hay DeCA con cargador asignado. */
export function filterDcdtRowsForUiSelector(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const withCargador = list.filter((r) => !!dcdtRowCargadorId(r));
  if (!withCargador.length) return list;
  return list.filter((r) => !isDcdtOrphanRow(r));
}

export async function fetchDcdtByServicio(servicioId) {
  const rows = await fetchAllDcdtByServicio(servicioId);
  return rows[0] ?? null;
}

/** Todas las filas DeCA de un servicio (1:N por cargador en demo). */
export async function fetchAllDcdtByServicio(servicioId) {
  if (!servicioId) return [];
  for (const cols of [COLS, COLS_CORE]) {
    const r = await dcdtRequest(`?servicio_id=eq.${servicioId}&select=${cols}&order=created_at.asc`);
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      return (Array.isArray(rows) ? rows : []).map(rowToDcdt).filter(Boolean);
    }
    const body = await r.text().catch(() => "");
    if (!/deca_public_id|fecha_inicio_efectivo|PGRST204|42703/i.test(body)) break;
  }
  return [];
}

export async function createDcdtForServicioCargador({
  servicioId,
  empresaId,
  cargadorId = null,
  stops = [],
}) {
  const datos = syncParteIdsFromStops(emptyDatos(), stops, { cargadorId });
  datos.mercancia = mercanciaDatosFromCargaStops(stops, cargadorId);
  console.error("[DCDT sync] createDcdtForServicioCargador payload", {
    servicioId,
    empresaId,
    cargadorId,
    partes: datos.partes,
    mercancia: datos.mercancia,
    stopBindings: datos.stops?.length ?? 0,
  });
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
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error("[DCDT sync] createDcdtForServicioCargador POST failed", {
      status: r.status,
      statusText: r.statusText,
      servicioId,
      cargadorId,
      body,
    });
    throw new Error(body || `No se pudo crear ${DECA_SHORT_LABEL} (HTTP ${r.status})`);
  }
  const rows = await r.json();
  const row = rowToDcdt(Array.isArray(rows) ? rows[0] : null);
  console.error("[DCDT sync] createDcdtForServicioCargador OK", {
    servicioId,
    dcdtId: row?.id,
    cargador_id: row?.datos?.partes?.cargador_id ?? null,
    mercancia: row?.datos?.mercancia ?? null,
  });
  return row;
}

/** Solo si fecha_inicio_efectivo sigue NULL (inmutable tras fijarse). */
export async function patchDcdtFechaInicioEfectivoIfNull(dcdtId, isoTimestamp) {
  if (!dcdtId || !isoTimestamp) return false;
  const r = await dcdtRequest(`?id=eq.${dcdtId}&fecha_inicio_efectivo=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ fecha_inicio_efectivo: isoTimestamp }),
  });
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

export async function ensureDcdtForServicio({ servicioId, empresaId, stops = [], servicio = null }) {
  const svc =
    servicio && typeof servicio === "object"
      ? servicio
      : { id: servicioId, empresa_id: empresaId };
  const existing = await fetchAllDcdtByServicio(servicioId);
  if (!isDecaAplicable(svc)) {
    return existing.length > 0 ? existing[0] : null;
  }
  if (existing.length > 0) return existing[0];
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
  if (!r.ok) throw new Error(`No se pudo inicializar ${DECA_SHORT_LABEL}`);
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export async function saveDcdtDatos(id, datos, estado = null, options = {}) {
  const current = await fetchDcdtById(id);
  let payloadDatos = datos && typeof datos === "object" ? { ...datos } : {};
  if (shouldMarkPdfStaleOnDatosSave(current, options)) {
    payloadDatos = withPdfStaleFlags(payloadDatos);
  }
  const body = { datos: payloadDatos, updated_at: new Date().toISOString() };
  if (estado) body.estado = estado;
  if (isDemoApp()) {
    console.log("[DCDT mercancía] payload", { dcdt_id: id, datos: body.datos?.mercancia, estado: body.estado ?? null });
  }
  const r = await dcdtRequest(`?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const resText = await r.text().catch(() => "");
  if (!r.ok) {
    if (isDemoApp()) {
      console.log("[DCDT mercancía] error Supabase", { dcdt_id: id, status: r.status, body: resText });
    }
    throw new Error(resText || `No se pudo guardar ${DECA_SHORT_LABEL}`);
  }
  let rows = [];
  try {
    rows = resText ? JSON.parse(resText) : [];
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows) || !rows[0]) {
    if (isDemoApp()) {
      console.log("[DCDT mercancía] resultado update", { dcdt_id: id, ok: false, rows: 0, hint: "RLS o id inexistente" });
    }
    throw new Error(`${DECA_SHORT_LABEL}: no se actualizó el registro (permisos RLS o fila no encontrada)`);
  }
  if (isDemoApp()) {
    console.log("[DCDT mercancía] resultado update", {
      dcdt_id: id,
      ok: true,
      mercancia: rows[0]?.datos?.mercancia ?? null,
      estado: rows[0]?.estado ?? null,
    });
  }
  return rowToDcdt(rows[0]);
}

/** Registra flag auditable si el servicio ya inició sin PDF DeCA (Paso 6a, sin bloqueo). */
export async function recordDecaPreStartGapIfNeeded(dcdt, servicio) {
  if (!dcdt?.id || !shouldWarnDecaMissingBeforeStart({ servicio, dcdt })) return dcdt;
  if (dcdt.datos?.deca_pre_start_gap?.detected_at) return dcdt;
  const datos = {
    ...(dcdt.datos || {}),
    deca_pre_start_gap: buildDecaPreStartGapMeta(servicio),
  };
  return saveDcdtDatos(dcdt.id, datos, dcdt.estado, { skipPdfStale: true });
}

export async function attachQrVerificationToDcdt(id, snapshot) {
  const current = await fetchDcdtById(id);
  if (!current) throw new Error(`${DECA_SHORT_LABEL} no encontrado`);
  const token = current.datos?.qr_verificacion_token || generateDcdtVerifyToken();
  const datos = {
    ...current.datos,
    qr_verificacion_token: token,
    qr_verificacion_snapshot: snapshot,
  };
  return saveDcdtDatos(id, datos, null, { skipPdfStale: true });
}

export async function fetchDcdtById(id) {
  const row = await dcdtSelectFirst(`?id=eq.${id}`);
  if (row) return row;
  const r = await dcdtRequest(`?id=eq.${id}&select=${COLS_CORE}&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

/** Garantiza deca_public_id en la fila (Paso 1 — estable para URL/QR). */
export async function ensureDecaPublicId(dcdt) {
  if (String(dcdt?.decaPublicId || "").trim()) return dcdt;
  const fresh = await fetchDcdtById(dcdt?.id);
  if (String(fresh?.decaPublicId || "").trim()) return fresh;

  const newId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `deca-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const r = await dcdtRequest(`?id=eq.${dcdt.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      deca_public_id: newId,
      datos: { ...(dcdt?.datos || emptyDatos()), deca_public_id: newId },
      updated_at: new Date().toISOString(),
    }),
  });
  const body = await r.text().catch(() => "");
  if (!r.ok) {
    if (/deca_public_id|42703|PGRST204/i.test(body)) {
      const datos = { ...(dcdt?.datos || emptyDatos()), deca_public_id: newId };
      const r2 = await dcdtRequest(`?id=eq.${dcdt.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ datos, updated_at: new Date().toISOString() }),
      });
      const body2 = await r2.text().catch(() => "");
      if (!r2.ok) {
        throw new Error(
          "No se pudo asignar identificador DeCA. Aplica la migración 20260712120000_dcdt_deca_public_id_demo.sql en Supabase demo.",
        );
      }
      const rows2 = body2 ? JSON.parse(body2) : [];
      return rowToDcdt(Array.isArray(rows2) ? rows2[0] : null) || { ...dcdt, decaPublicId: newId, datos };
    }
    throw new Error("No se pudo asignar identificador DeCA");
  }
  const rows = body ? JSON.parse(body) : [];
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null) || { ...dcdt, decaPublicId: newId };
}

export async function ensureDcdtQrVerification({ dcdt, doc, servicio, conductor = null, missing = [] }) {
  if (!dcdt?.id || !isDcdtQrEligible(dcdt.estado, { missing })) return dcdt;
  const snap = dcdt.datos?.qr_verificacion_snapshot;
  const hasFullSnap =
    snap?.schema_version >= 2 || (snap?.cargador && snap?.mercancia && snap?.transportista);
  if (dcdt.datos?.qr_verificacion_token && hasFullSnap) return dcdt;
  const snapshot = buildDcdtVerifySnapshot({ doc, dcdt, servicio, conductor });
  return attachQrVerificationToDcdt(dcdt.id, snapshot);
}

export async function validarDcdtTrafico(id, userId, { doc, servicio, conductor, missing = [], dcdt = null } = {}) {
  if (Array.isArray(missing) && missing.length > 0) {
    throw new Error("Completa los campos obligatorios antes de validar");
  }
  const current = dcdt || (await fetchDcdtById(id));
  const validacion_snapshot = buildValidacionSnapshot(doc);
  const nextDatos = {
    ...(current?.datos || emptyDatos()),
    validacion_snapshot,
    transportista_resuelto: doc?.transportista || null,
    vehiculo: {
      ...(current?.datos?.vehiculo || {}),
      use_conductor_matricula: true,
      matricula_override: doc?.vehiculo?.matricula || current?.datos?.vehiculo?.matricula_override || null,
      remolque_override: doc?.vehiculo?.remolque || current?.datos?.vehiculo?.remolque_override || null,
    },
  };
  const r = await dcdtRequest(`?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      estado: DCDT_ESTADO.VALIDADO,
      validado_por: userId,
      validado_at: new Date().toISOString(),
      datos: nextDatos,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(body ? `No se pudo validar ${DECA_SHORT_LABEL} (${r.status})` : `No se pudo validar ${DECA_SHORT_LABEL}`);
  }
  const rows = await r.json();
  let next = rowToDcdt(Array.isArray(rows) ? rows[0] : null);
  if (next && doc && servicio) {
    try {
      next = await ensureDcdtQrVerification({ dcdt: next, doc, servicio, conductor });
    } catch {
      /* QR opcional; validación ya aplicada */
    }
  }
  if (next?.datos?.pdf_stale && doc && servicio) {
    try {
      const { regenerateDcdtPdfIfStale } = await import("./dcdtPdfDocument.js");
      const docForPdf = {
        ...doc,
        validado_at: next.validadoAt || new Date().toISOString(),
      };
      const refreshed = await regenerateDcdtPdfIfStale({
        servicio,
        dcdt: next,
        doc: docForPdf,
        userId,
      });
      if (refreshed?.dcdt) next = refreshed.dcdt;
    } catch (e) {
      if (isDemoApp()) console.error("[DCDT] PDF stale regen on validate failed", e?.message || e);
    }
  }
  return next;
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

export async function markDcdtPdfGenerado(id, meta = {}) {
  if (!meta.pdfStoragePath) {
    throw new Error(`PDF ${DECA_SHORT_LABEL}: no se registró sin ruta en storage`);
  }
  const current = await fetchDcdtById(id);
  const datos = {
    ...(current?.datos || {}),
    pdf_documento_extra_id: meta.pdfDocumentoExtraId ?? current?.datos?.pdf_documento_extra_id ?? null,
    pdf_archivo_url: meta.pdfArchivoUrl ?? current?.datos?.pdf_archivo_url ?? null,
    pdf_archivo_nombre: meta.pdfArchivoNombre ?? current?.datos?.pdf_archivo_nombre ?? null,
    pdf_retention_until: meta.pdfRetentionUntil ?? current?.datos?.pdf_retention_until ?? null,
    pdf_dcdt_version: meta.pdfDcdtVersion ?? current?.datos?.pdf_dcdt_version ?? null,
    pdf_storage_bucket: meta.pdfStorageBucket ?? current?.datos?.pdf_storage_bucket ?? null,
    pdf_storage_path: meta.pdfStoragePath ?? current?.datos?.pdf_storage_path ?? null,
    deca_download_url: meta.decaDownloadUrl ?? current?.datos?.deca_download_url ?? null,
    deca_public_id: meta.decaPublicId ?? current?.datos?.deca_public_id ?? null,
    deca_qr_png_storage_bucket:
      meta.decaQrPngStorageBucket ?? current?.datos?.deca_qr_png_storage_bucket ?? null,
    deca_qr_png_storage_path:
      meta.decaQrPngStoragePath ?? current?.datos?.deca_qr_png_storage_path ?? null,
    pdf_size_bytes: meta.pdfSizeBytes ?? current?.datos?.pdf_size_bytes ?? null,
    pdf_has_qr: meta.pdfHasQr ?? current?.datos?.pdf_has_qr ?? null,
    pdf_stale: false,
    pdf_stale_at: null,
  };
  const r = await dcdtRequest(`?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      pdf_generado_at: new Date().toISOString(),
      datos,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(body ? `No se pudo registrar PDF (${r.status})` : "No se pudo registrar PDF");
  }
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export function isDcdtValidadoParaExpediente(dcdt, { missing = [] } = {}) {
  if (missing.length > 0) return false;
  return isDcdtEstadoValidated(dcdt?.estado);
}
