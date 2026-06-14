import { sbFetch } from "../../data/supabaseClient.js";
import { getStopOperacionMeta } from "../service/stopOperacionMeta.js";
import { operationalGroupFromStopTipo } from "../service/tripOperationalDossier.js";
import { getServiceNumberForDisplay, resolveServiceRouteEndpoints } from "../service/serviceIdentity.js";
import { resolveParteFields, suggestParteTipoForStop } from "./partesTransporteModel.js";
import { formatDcdtDisplayValue } from "./dcdtDisplayText.js";
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

function parseMercanciaNumber(val) {
  if (val == null || val === "") return null;
  const n = Number(String(val).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function buildMercanciaDatosPatch(mercanciaEdit) {
  return {
    descripcion: String(mercanciaEdit?.descripcion || "").trim() || null,
    peso_kg: parseMercanciaNumber(mercanciaEdit?.peso_kg),
    bultos: parseMercanciaNumber(mercanciaEdit?.bultos),
    palets: parseMercanciaNumber(mercanciaEdit?.palets),
  };
}

export function mercanciaEditFromDatos(mercancia = {}) {
  return {
    descripcion: formatDcdtDisplayValue(mercancia.descripcion) || "",
    peso_kg: mercancia.peso_kg != null ? String(mercancia.peso_kg) : "",
    bultos: mercancia.bultos != null ? String(mercancia.bultos) : "",
    palets: mercancia.palets != null ? String(mercancia.palets) : "",
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
  const out = { ...datos, partes: { ...(datos?.partes || {}) } };
  out.stops = buildStopBindingsFromStops(stops);
  for (const b of out.stops) {
    if (!b.parte_id) continue;
    if (b.grupo === "carga") out.partes.cargador_id = b.parte_id;
    if (b.grupo === "descarga") out.partes.destinatario_id = b.parte_id;
  }
  return out;
}

function partesIdsChanged(before, after) {
  const a = before?.partes || {};
  const b = after?.partes || {};
  return a.cargador_id !== b.cargador_id || a.destinatario_id !== b.destinatario_id;
}

/** Sincroniza cargador/destinatario desde paradas y persiste si cambió. */
export async function persistDcdtPartesFromStops({
  dcdt,
  servicio,
  stops = [],
  flotaEvs = {},
  empresa = null,
  conductor = null,
  masterById = {},
}) {
  if (!dcdt?.id) return dcdt;
  const syncedDatos = syncParteIdsFromStops(dcdt.datos, stops);
  if (!partesIdsChanged(dcdt.datos, syncedDatos)) return dcdt;
  const { missing } = resolveDcdtDocument({
    servicio,
    stops,
    dcdt: { ...dcdt, datos: syncedDatos },
    masterById,
    empresa,
    conductor,
  });
  const estado = computeDcdtEstado({
    missing,
    evidenciasByStop: flotaEvs,
    datos: syncedDatos,
    currentEstado: dcdt.estado,
  });
  return saveDcdtDatos(dcdt.id, syncedDatos, estado);
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

function applyValidacionSnapshot(doc, dcdt) {
  const snap = dcdt?.datos?.validacion_snapshot;
  if (!snap || !isDcdtEstadoValidated(dcdt?.estado)) return doc;
  return {
    ...doc,
    cargador: snap.cargador || doc.cargador,
    destinatario: snap.destinatario || doc.destinatario,
    transportista: snap.transportista || doc.transportista,
    origen: snap.origen || doc.origen,
    destino: snap.destino || doc.destino,
    mercancia: snap.mercancia || doc.mercancia,
    fecha_transporte: snap.fecha_transporte || doc.fecha_transporte,
    vehiculo: snap.vehiculo || doc.vehiculo,
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
  const datos = syncParteIdsFromStops(dcdt?.datos || emptyDatos(), stops);
  const partes = datos.partes || {};

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
  const remolque = String(conductor?.remolque || "").trim() || null;

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
export function isDcdtFullyValidated({ estado, missing = [] }) {
  return missing.length === 0 && isDcdtEstadoValidated(estado);
}

/** Etiqueta UX unificada empresa/conductor. */
export function dcdtStatusUxLabel({ estado, missing = [], pdfGeneradoAt = null }) {
  if (missing.length > 0) {
    const e = computeDcdtEstado({ missing, evidenciasByStop: {}, datos: {}, currentEstado: estado });
    if (e === DCDT_ESTADO.PENDIENTE_OCR) return "DCDT pendiente OCR";
    if (e === DCDT_ESTADO.PENDIENTE_VALIDACION) return "DCDT completo — listo para validar";
    return "DCDT incompleto";
  }
  if (!isDcdtEstadoValidated(estado)) return "DCDT completo — listo para validar";
  if (pdfGeneradoAt) return "DCDT validado · PDF generado";
  return "DCDT validado";
}

/** Rebaja estado validado si faltan campos obligatorios y persiste. */
export async function reconcileDcdtEstadoIfNeeded({ dcdt, missing, flotaEvs = {}, datos }) {
  if (!dcdt?.id) return dcdt;
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
    throw new Error(resText || "No se pudo guardar DCDT");
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
    throw new Error("DCDT: no se actualizó el registro (permisos RLS o fila no encontrada)");
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

export async function attachQrVerificationToDcdt(id, snapshot) {
  const current = await fetchDcdtById(id);
  if (!current) throw new Error("DCDT no encontrado");
  const token = current.datos?.qr_verificacion_token || generateDcdtVerifyToken();
  const datos = {
    ...current.datos,
    qr_verificacion_token: token,
    qr_verificacion_snapshot: snapshot,
  };
  return saveDcdtDatos(id, datos);
}

export async function fetchDcdtById(id) {
  const r = await dcdtRequest(`?id=eq.${id}&select=${COLS}&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
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
  if (!r.ok) throw new Error("No se pudo validar DCDT");
  const rows = await r.json();
  let next = rowToDcdt(Array.isArray(rows) ? rows[0] : null);
  if (next && doc && servicio) {
    try {
      next = await ensureDcdtQrVerification({ dcdt: next, doc, servicio, conductor });
    } catch {
      /* QR opcional; validación ya aplicada */
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
    throw new Error("PDF DCDT: no se registró sin ruta en storage");
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
  if (!r.ok) throw new Error("No se pudo registrar PDF");
  const rows = await r.json();
  return rowToDcdt(Array.isArray(rows) ? rows[0] : null);
}

export function isDcdtValidadoParaExpediente(dcdt, { missing = [] } = {}) {
  if (missing.length > 0) return false;
  return isDcdtEstadoValidated(dcdt?.estado);
}
