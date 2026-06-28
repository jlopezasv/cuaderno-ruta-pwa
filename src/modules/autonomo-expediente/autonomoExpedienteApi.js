import {
  ensureAuthAccessToken,
  getAuthUid,
  jwtSubFromToken,
  sbFetch,
  sbSelect,
} from "../../data/supabaseClient.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { SERVICIO_ESTADO_EN_CURSO, SERVICIO_ESTADO_COMPLETADO } from "../../domain/fleet/serviceStatus.js";
import { insertStopsForServicio } from "../../domain/fleet/servicioStopsInsert.js";
import { prepareStopRowForPersist } from "../../domain/geo/stopGeoModel.js";
import { mergeStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { parsePostgrestError } from "../../domain/service/serviceCreateStepTrace.js";
import {
  resolveServicioInsertContext,
  SERVICIO_OWNERSHIP,
  buildAutonomoProOwnServiciosQuery,
} from "../../domain/service/serviceOwnership.js";
import { mergeReferenciaOperacional } from "../../domain/service/serviceOperacionMeta.js";
import { upsertAutonomoAlmacen } from "./autonomoAlmacenCatalog.js";
import { upsertAutonomoDestino } from "./autonomoDestinoCatalog.js";
import {
  AUTONOMO_EXPEDIENTE_MARK,
  appendTimelineEvent,
  isAutonomoExpedienteServicio,
  mergeAutonomoExpedientePatch,
  pdfVisibilityKey,
  getAutonomoExpedienteMeta,
} from "./autonomoExpedienteMeta.js";
import { CARGA_ALCANCE_META_KEY, generarDecaParaCarga } from "./autonomoExpedienteDeca.js";
import {
  CARGA_ESTADO,
  computeMuelleMinutes,
} from "./autonomoExpedienteStopModel.js";
import { SERVICIO_ALCANCE_DEFAULT, normalizeServicioAlcance } from "../../domain/service/servicioAlcance.js";
import { cerrarExpedienteServicio } from "../../domain/service/cerrarExpedienteServicio.js";
import { archiveAutonomoExpedienteLocal } from "./autonomoExpedienteArchive.js";
import { isOperacionAnulada } from "../../domain/service/operationalVisualModel.js";

async function patchServicioReferencia(servicioId, referencia) {
  const r = await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ referencia, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`No se pudo actualizar expediente (${r.status})`);
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

async function fetchServicioById(id) {
  const rows = await sbSelect("servicios", `id=eq.${id}&limit=1`);
  return Array.isArray(rows) ? rows[0] : rows;
}

async function debugAutonomoInsertRls(authUid) {
  if (!isDemoApp()) return null;
  try {
    const dbgRes = await sbFetch("/rest/v1/rpc/debug_servicio_insert_rls_context", {
      method: "POST",
      body: JSON.stringify({
        p_empresa_id: null,
        p_conductor_id: authUid,
      }),
    });
    if (!dbgRes.ok) return null;
    return await dbgRes.json().catch(() => null);
  } catch {
    return null;
  }
}

function rls42501Message(authUid, errText, dbg = null) {
  const parsed = parsePostgrestError(errText);
  const dbgHint = dbg
    ? ` · can_insert=${dbg.user_can_insert_servicio} · is_autonomo_pro=${dbg.user_profile_is_autonomo_pro ?? "?"}`
    : "";
  return (
    `RLS 42501 en servicios: tu perfil debe ser autonomo_pro y conductor_id=${authUid ?? "?"} debe coincidir con la sesión.` +
    `${parsed.message ? ` ${parsed.message}` : ""}${dbgHint}`
  );
}

async function createAutonomoExpedienteViaRpc(referencia, fechaInicio, estado) {
  const r = await sbFetch("/rest/v1/rpc/create_autonomo_expediente_servicio", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_referencia: referencia,
      p_fecha_inicio: fechaInicio,
      p_estado: estado,
    }),
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  if (!data || typeof data !== "object") return null;
  return data;
}

async function createAutonomoExpedienteViaPost(payload, authUid) {
  const res = await sbFetch("/rest/v1/servicios", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const dbg = await debugAutonomoInsertRls(authUid);
    throw new Error(rls42501Message(authUid, errText, dbg));
  }
  if (payload.id) {
    const row = await fetchServicioById(payload.id);
    if (row?.id) return row;
    return { id: payload.id, ...payload };
  }
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data[0] : data;
}

export async function fetchAutonomoExpedientes(uid, { limit = 30 } = {}) {
  if (!uid) return [];
  const path = buildAutonomoProOwnServiciosQuery(uid, { limit });
  const r = await sbFetch(path);
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  const list = Array.isArray(rows) ? rows : [];
  return list.filter(isAutonomoExpedienteServicio);
}

export async function fetchActiveAutonomoExpediente(uid) {
  const list = await fetchAutonomoExpedientes(uid, { limit: 20 });
  return (
    list.find((s) => {
      const st = String(s.estado || "").toLowerCase();
      return st === SERVICIO_ESTADO_EN_CURSO || st === "asignado";
    }) || null
  );
}

/** Crea expediente vacío en curso — sin origen, destino ni cliente. */
export async function createAutonomoExpediente(uid, { profile = {} } = {}) {
  const authToken = await ensureAuthAccessToken();
  if (!authToken) throw new Error("Sesión no válida");
  const authUid = jwtSubFromToken(authToken) || uid || getAuthUid();
  if (!authUid) throw new Error("Sesión no válida (JWT sin sub)");

  const now = new Date().toISOString();
  const referencia = mergeReferenciaOperacional(null, {
    [AUTONOMO_EXPEDIENTE_MARK]: true,
    expediente_started_at: now,
    timeline_events: [{ type: "expediente_iniciado", at: now, label: "Expediente iniciado" }],
    pdf_visibility: {},
    conductor_label: String(profile.nombre || "").trim() || null,
    matricula: String(profile.matricula || "").trim() || null,
    remolque: String(profile.remolque || "").trim() || null,
  });

  const insertCtx = await resolveServicioInsertContext({
    ownershipMode: SERVICIO_OWNERSHIP.AUTONOMO_PRO,
    estado: SERVICIO_ESTADO_EN_CURSO,
    uid: authUid,
  });
  if (insertCtx.conductor_id !== authUid) {
    throw new Error("Autónomo PRO: conductor_id debe coincidir con auth.uid()");
  }

  let row = await createAutonomoExpedienteViaRpc(referencia, now, SERVICIO_ESTADO_EN_CURSO);
  if (!row?.id) {
    const servicioId =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined;
    row = await createAutonomoExpedienteViaPost(
      {
        ...(servicioId ? { id: servicioId } : {}),
        empresa_id: null,
        conductor_id: authUid,
        estado: SERVICIO_ESTADO_EN_CURSO,
        origen: "",
        destino: "",
        referencia,
        fecha_inicio: now,
      },
      authUid,
    );
  }

  try {
    window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));
  } catch {
    /* SSR */
  }
  return row;
}

export async function appendExpedienteTimeline(servicioId, event) {
  const servicio = await fetchServicioById(servicioId);
  if (!servicio) throw new Error("Expediente no encontrado");
  const referencia = appendTimelineEvent(servicio.referencia, event);
  return patchServicioReferencia(servicioId, referencia);
}

async function fetchStopById(stopId) {
  const r = await sbFetch(`/rest/v1/stops?id=eq.${stopId}&select=*&limit=1`);
  if (!r.ok) throw new Error("Parada no encontrada");
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

/**
 * Cancela o anula una operación no confirmada (sin DeCA vinculado).
 */
export async function cancelAutonomoStopOperacion({ stopId, servicioId, mode = "delete", motivo = "" }) {
  if (!stopId) throw new Error("Parada no válida");
  if (mode === "delete") {
    const r = await sbFetch(`/rest/v1/stops?id=eq.${stopId}`, { method: "DELETE" });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(body || `No se pudo cancelar la operación (${r.status})`);
    }
  } else {
    await patchStopOperacionMeta(stopId, {
      operacion_estado: "anulada",
      anulacion_motivo: String(motivo || "Anulado por error").trim(),
      anulada_at: new Date().toISOString(),
    });
  }
  if (servicioId) {
    await appendExpedienteTimeline(servicioId, {
      type: mode === "delete" ? "operacion_cancelada" : "operacion_anulada",
      label: mode === "delete" ? "Operación cancelada" : "Operación anulada por error",
      stopId,
    });
  }
}

export async function patchStopOperacionMeta(stopId, patch) {
  const stop = await fetchStopById(stopId);
  if (!stop) throw new Error("Parada no encontrada");
  const notas = mergeStopOperacionMeta(stop.notas, patch);
  const pr = await sbFetch(`/rest/v1/stops?id=eq.${stopId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ notas }),
  });
  if (!pr.ok) {
    const body = await pr.text().catch(() => "");
    throw new Error(body || `No se pudo actualizar parada (${pr.status})`);
  }
  const rows = await pr.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

async function appendDecaLinkToExpediente(servicioId, link) {
  const servicio = await fetchServicioById(servicioId);
  if (!servicio) throw new Error("Expediente no encontrado");
  const prev = getAutonomoExpedienteMeta(servicio).decaLinks || [];
  const next = [...prev.filter((l) => l.carga_stop_id !== link.carga_stop_id), link];
  const referencia = mergeAutonomoExpedientePatch(servicio.referencia, {
    deca_autonomo_links: next,
  });
  return patchServicioReferencia(servicioId, referencia);
}

export async function generarDecaCargaExpediente({
  servicioId,
  cargaStopId,
  workspace,
  profile,
  uid,
  transportista,
  conductor,
  vehiculo = {},
}) {
  const { servicio, stops, cargas, evidenciasByStop } = workspace || {};
  const carga = (cargas || []).find((c) => c.id === cargaStopId);
  if (!carga) throw new Error("Carga no encontrada");

  const result = await generarDecaParaCarga({
    servicio,
    cargaStop: carga,
    stops: stops || [],
    evidenciasByStop: evidenciasByStop || {},
    profile,
    transportista,
    conductor,
    vehiculo,
    userId: uid,
    downloadAfter: true,
  });

  await appendDecaLinkToExpediente(servicioId, {
    deca_id: result.decaId,
    deca_public_id: result.decaPublicId,
    carga_stop_id: result.cargaStopId,
    carga_nombre: result.cargaNombre,
    origen: result.origen,
    destino: result.destino,
    download_url: result.downloadUrl,
    generado_at: new Date().toISOString(),
  });

  await patchStopOperacionMeta(cargaStopId, {
    deca_id: result.decaId,
    deca_public_id: result.decaPublicId,
  });

  await appendExpedienteTimeline(servicioId, {
    type: "deca_generado",
    label: `DeCA: ${result.origen} → ${result.destino}`,
    stopId: cargaStopId,
    refId: result.decaId,
  });

  return result;
}

export async function setExpedientePdfVisibility(servicioId, kind, id, include) {
  const servicio = await fetchServicioById(servicioId);
  if (!servicio) throw new Error("Expediente no encontrado");
  const { pdfVisibility } = getAutonomoExpedienteMeta(servicio);
  const referencia = mergeAutonomoExpedientePatch(servicio.referencia, {
    pdf_visibility: { ...pdfVisibility, [pdfVisibilityKey(kind, id)]: !!include },
  });
  return patchServicioReferencia(servicioId, referencia);
}

function almacenToStopForm(almacen, { tipo, orden, extraMeta = {} }) {
  const row = prepareStopRowForPersist({
    orden,
    tipo,
    nombre: almacen.nombre,
    empresa: almacen.nombre,
    direccion: almacen.direccion,
    codigo_postal: almacen.cp,
    provincia: almacen.ciudad,
    pais: "ES",
    detalles: "",
  });
  const now = new Date().toISOString();
  const metaPatch = {
    ...extraMeta,
    empresa_logistica: almacen.nombre,
    codigo_postal: almacen.cp || null,
    provincia: almacen.ciudad || null,
    contacto: almacen.contacto || null,
    telefono: almacen.telefono || null,
    cif: almacen.cif || null,
    autonomo_expediente: true,
    ...(tipo === "carga"
      ? {
          carga_estado: CARGA_ESTADO.PENDIENTE_ENTRADA,
          carga_registrada_at: now,
        }
      : {}),
    ...(tipo === "descarga" ? { destino_estado: "pendiente", destino_anadido_at: now } : {}),
  };
  return {
    ...row,
    notas: mergeStopOperacionMeta(row.notas, metaPatch),
  };
}

export async function registerCargaOnExpediente({
  servicioId,
  uid,
  almacen,
  orden = null,
  alcance = SERVICIO_ALCANCE_DEFAULT,
  mercancia = null,
  geoEntrada = null,
  esRetorno = false,
  retornoDesdeStopId = null,
  requiereDeca = null,
}) {
  const servicio = await fetchServicioById(servicioId);
  if (!servicio) throw new Error("Expediente no encontrado");

  const stopsRes = await sbFetch(`/rest/v1/stops?servicio_id=eq.${servicioId}&select=id,orden&order=orden.desc&limit=1`);
  const stopsRows = stopsRes.ok ? await stopsRes.json().catch(() => []) : [];
  const maxOrden = Array.isArray(stopsRows) && stopsRows[0] ? Number(stopsRows[0].orden) || 0 : 0;
  const nextOrden = orden ?? maxOrden + 1;

  upsertAutonomoAlmacen(uid, almacen);

  const stopRow = almacenToStopForm(almacen, {
    tipo: "carga",
    orden: nextOrden,
    extraMeta: {
      [CARGA_ALCANCE_META_KEY]: normalizeServicioAlcance(alcance),
      ...(mercancia && typeof mercancia === "object" ? { mercancia } : {}),
      ...(esRetorno ? { es_retorno: true, retorno_desde_stop_id: retornoDesdeStopId || null } : {}),
      ...(requiereDeca === false ? { no_requiere_deca: true } : {}),
      ...(requiereDeca === true ? { requiere_deca: true } : {}),
    },
  });
  const result = await insertStopsForServicio(servicioId, [stopRow]);
  if (!result.ok) throw new Error(result.detail || result.error || "No se pudo preparar la carga");

  let inserted = result.rows?.[0];
  await appendExpedienteTimeline(servicioId, {
    type: "carga_preparada",
    label: `Almacén: ${almacen.nombre}`,
    stopId: inserted?.id,
  });

  return { stop: inserted, servicio: await fetchServicioById(servicioId) };
}

/** Entrada en muelle: solo hora (+ GPS opcional). Separado de preparar almacén/carga. */
export async function registrarEntradaMuelleCarga({ stopId, servicioId, geo = null }) {
  const now = new Date().toISOString();
  const patch = {
    carga_estado: CARGA_ESTADO.EN_MUELLE,
    entrada_at: now,
    ...(geo ? { entrada_geo: geo } : {}),
  };
  const updated = await patchStopOperacionMeta(stopId, patch);
  const pr = await sbFetch(`/rest/v1/stops?id=eq.${stopId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ estado: "llegado", hora_llegada_real: now }),
  });
  let row = updated;
  if (pr.ok) {
    const rows = await pr.json().catch(() => []);
    row = Array.isArray(rows) ? rows[0] : updated;
  }
  if (servicioId) {
    await appendExpedienteTimeline(servicioId, {
      type: "entrada_muelle",
      label: `Entrada en muelle · ${row?.nombre || "carga"}`,
      stopId,
    });
  }
  return row;
}

export async function updateCargaMercancia({ stopId, servicioId, mercancia, observaciones = null }) {
  const patch = {};
  if (mercancia && typeof mercancia === "object") patch.mercancia = mercancia;
  if (observaciones != null) patch.observaciones_carga = String(observaciones || "").trim() || null;
  const updated = await patchStopOperacionMeta(stopId, patch);
  if (servicioId) {
    await appendExpedienteTimeline(servicioId, {
      type: "carga_actualizada",
      label: "Datos de carga actualizados",
      stopId,
    });
  }
  return updated;
}

/** @deprecated Usar registrarEntradaMuelleCarga */
export async function registrarLlegadaCarga({ stopId, servicioId, geo = null }) {
  return registrarEntradaMuelleCarga({ stopId, servicioId, geo });
}

export async function terminarCargaMuelle({ stopId, servicioId, geo = null }) {
  const stop = await fetchStopById(stopId);
  if (!stop) throw new Error("Carga no encontrada");
  const meta = mergeStopOperacionMeta(stop.notas, {});
  const now = new Date().toISOString();
  const entradaAt = meta.entrada_at || now;
  const minutos = computeMuelleMinutes(entradaAt, now);
  const patch = {
    carga_estado: CARGA_ESTADO.COMPLETADA,
    salida_at: now,
    ...(geo ? { salida_geo: geo } : {}),
    tiempo_muelle_min: minutos,
  };
  const updated = await patchStopOperacionMeta(stopId, patch);
  const pr = await sbFetch(`/rest/v1/stops?id=eq.${stopId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ estado: "completado", hora_salida_real: now }),
  });
  let row = updated;
  if (pr.ok) {
    const rows = await pr.json().catch(() => []);
    row = Array.isArray(rows) ? rows[0] : updated;
  }
  if (servicioId) {
    await appendExpedienteTimeline(servicioId, {
      type: "salida_muelle",
      label: `Salida muelle · carga terminada${minutos != null ? ` · ${minutos} min` : ""}`,
      stopId,
    });
  }
  return row;
}

export async function setCargaRequiereDeca({ stopId, requiere, nota = "" }) {
  return patchStopOperacionMeta(stopId, {
    no_requiere_deca: requiere === false,
    requiere_deca: requiere === true,
    retorno_deca_nota: nota || null,
  });
}

export async function addDestinoOnExpediente({ servicioId, uid, destino, orden = null }) {
  const servicio = await fetchServicioById(servicioId);
  if (!servicio) throw new Error("Expediente no encontrado");

  const stopsRes = await sbFetch(`/rest/v1/stops?servicio_id=eq.${servicioId}&select=id,orden&order=orden.desc&limit=1`);
  const stopsRows = stopsRes.ok ? await stopsRes.json().catch(() => []) : [];
  const maxOrden = Array.isArray(stopsRows) && stopsRows[0] ? Number(stopsRows[0].orden) || 0 : 0;
  const nextOrden = orden ?? maxOrden + 1;

  const almacen = {
    nombre: destino.cliente || destino.nombre,
    direccion: destino.direccion,
    cp: destino.cp,
    ciudad: destino.ciudad,
  };
  if (almacen.nombre) upsertAutonomoDestino(uid, almacen);

  const stopRow = almacenToStopForm(almacen, {
    tipo: "descarga",
    orden: nextOrden,
    extraMeta: {
      destino_cliente: destino.cliente || almacen.nombre,
      destino_fecha: destino.fecha || null,
    },
  });

  const result = await insertStopsForServicio(servicioId, [stopRow]);
  if (!result.ok) {
    const detail = result.detail || result.error || "No se pudo añadir destino";
    throw new Error(detail);
  }

  const inserted = result.rows?.[0];
  await appendExpedienteTimeline(servicioId, {
    type: "destino_anadido",
    label: `Destino: ${almacen.nombre}`,
    stopId: inserted?.id,
  });

  return { stop: inserted, servicio: await fetchServicioById(servicioId) };
}

export async function updateDestinoEstado({ stopId, servicioId, estado, geo = null }) {
  const sr = await sbFetch(`/rest/v1/stops?id=eq.${stopId}&select=*&limit=1`);
  if (!sr.ok) throw new Error("Parada no encontrada");
  const rows = await sr.json().catch(() => []);
  const stop = Array.isArray(rows) ? rows[0] : null;
  if (!stop) throw new Error("Parada no encontrada");

  const now = new Date().toISOString();
  const patch = { destino_estado: estado };
  if (estado === "entregado") patch.entrega_completada_at = now;
  if (geo?.entrada) {
    patch.entrada_at = now;
    patch.entrada_geo = geo.entrada;
  }
  if (geo?.salida) {
    patch.salida_at = now;
    patch.salida_geo = geo.salida;
    const meta = mergeStopOperacionMeta(stop.notas, {});
    const entradaAt = meta.entrada_at || patch.entrada_at;
    const minutos = computeMuelleMinutes(entradaAt, now);
    if (minutos != null) patch.tiempo_destino_min = minutos;
  }

  const notas = mergeStopOperacionMeta(stop.notas, patch);
  const pr = await sbFetch(`/rest/v1/stops?id=eq.${stopId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ notas }),
  });
  if (!pr.ok) {
    const body = await pr.text().catch(() => "");
    throw new Error(body || `No se pudo actualizar destino (${pr.status})`);
  }

  if (servicioId) {
    const evtType =
      estado === "entregado"
        ? "entrega_completada"
        : geo?.entrada
          ? "entrega_llegada"
          : geo?.salida
            ? "entrega_salida"
            : "destino_anadido";
    await appendExpedienteTimeline(servicioId, {
      type: evtType,
      label: `${stop.nombre} · ${estado}`,
      stopId,
    });
  }

  const updated = await pr.json().catch(() => []);
  return Array.isArray(updated) ? updated[0] : updated;
}

export async function finalizarAutonomoExpediente(servicioId) {
  const now = new Date().toISOString();
  const r = await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      estado: SERVICIO_ESTADO_COMPLETADO,
      fecha_fin_est: now,
      updated_at: now,
    }),
  });
  if (!r.ok) throw new Error(`No se pudo finalizar expediente (${r.status})`);
  await appendExpedienteTimeline(servicioId, {
    type: "expediente_finalizado",
    label: "Expediente finalizado",
    at: now,
  });
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Cierra el expediente con firma. DeCA se genera por carga durante el viaje, no aquí.
 */
export async function generarExpedienteAutonomo({
  servicio,
  workspace,
  profile,
  uid,
  transportista,
  conductor,
  firmaCanvas,
  comentario = "",
  conductorNombre = null,
}) {
  if (!servicio?.id) throw new Error("Expediente no válido");
  if (!firmaCanvas) throw new Error("Añade tu firma antes de finalizar el expediente");

  let servicioFresh = await fetchServicioById(servicio.id);

  const closed = await cerrarExpedienteServicio({
    servicio: servicioFresh,
    comentario,
    firmaCanvas,
    conductorId: uid,
    conductorNombre: conductorNombre || conductor?.nombre || null,
  });

  const now = new Date().toISOString();
  await sbFetch(`/rest/v1/servicios?id=eq.${servicio.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ fecha_fin_est: now, updated_at: now }),
  });

  await appendExpedienteTimeline(servicio.id, {
    type: "expediente_generado",
    label: "Expediente finalizado",
    at: now,
  });

  const { decaLinks } = getAutonomoExpedienteMeta(closed.servicio || servicioFresh);
  return {
    servicio: closed.servicio,
    decas: decaLinks || [],
    firmaUrl: closed.firmaUrl,
    decaError: null,
  };
}

/** Archiva expediente autónomo (oculto en lista; datos conservados). */
export async function archiveAutonomoExpediente(servicioId, uid) {
  const servicio = await fetchServicioById(servicioId);
  if (!servicio) throw new Error("Expediente no encontrado");

  const archivedAt = new Date().toISOString();
  const referencia = mergeAutonomoExpedientePatch(servicio.referencia, {
    archived_at: archivedAt,
    archive: { status: "archived", at: archivedAt, by: uid || null },
  });
  await patchServicioReferencia(servicioId, referencia);
  archiveAutonomoExpedienteLocal(uid, servicioId);
  await appendExpedienteTimeline(servicioId, {
    type: "expediente_archivado",
    label: "Expediente archivado",
    at: archivedAt,
  });
  return fetchServicioById(servicioId);
}

export async function loadAutonomoExpedienteWorkspace(servicioId) {
  if (!servicioId) return null;
  const [servicioRes, stopsRes, extraRes] = await Promise.all([
    sbFetch(`/rest/v1/servicios?id=eq.${servicioId}&limit=1`),
    sbFetch(`/rest/v1/stops?servicio_id=eq.${servicioId}&order=orden.asc`),
    sbFetch(`/rest/v1/servicio_documentos_extra?servicio_id=eq.${servicioId}&order=created_at.asc`),
  ]);
  const servicioRows = servicioRes.ok ? await servicioRes.json().catch(() => []) : [];
  const servicio = Array.isArray(servicioRows) ? servicioRows[0] : null;
  const stops = stopsRes.ok ? await stopsRes.json().catch(() => []) : [];
  const stopList = Array.isArray(stops) ? stops : [];
  const extraDocumentos = extraRes.ok ? await extraRes.json().catch(() => []) : [];

  const stopIds = stopList.map((s) => s.id).filter(Boolean);
  let evidenciasByStop = {};
  if (stopIds.length) {
    const { fetchEvidenciasGroupedByStop } = await import("../../domain/service/serviceDocuments.js");
    evidenciasByStop = await fetchEvidenciasGroupedByStop(stopIds, sbFetch);
  }

  const { buildAutonomoExpedienteTimeline } = await import("./buildAutonomoExpedienteTimeline.js");
  const timeline = buildAutonomoExpedienteTimeline({
    servicio,
    stops: stopList,
    evidenciasByStop,
    extraDocumentos: Array.isArray(extraDocumentos) ? extraDocumentos : [],
  });

  const cargas = stopList.filter(
    (s) => String(s.tipo).toLowerCase() === "carga" && !isOperacionAnulada(s),
  );
  const destinos = stopList.filter(
    (s) => String(s.tipo).toLowerCase() === "descarga" && !isOperacionAnulada(s),
  );

  return {
    servicio,
    stops: stopList,
    cargas,
    destinos,
    evidenciasByStop,
    extraDocumentos: Array.isArray(extraDocumentos) ? extraDocumentos : [],
    timeline,
  };
}
