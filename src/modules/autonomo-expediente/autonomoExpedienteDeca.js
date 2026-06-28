import { evidenciaHasCmrOcr } from "../../domain/documents/cmrOcrStop.js";
import { createAutonomoDeca } from "../../domain/dcdt/decaAutonomoModel.js";
import { generateAndPersistAutonomoDecaPdf } from "../../domain/dcdt/decaAutonomoPdf.js";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { getServicioOperacionMeta } from "../../domain/service/serviceOperacionMeta.js";
import {
  SERVICIO_ALCANCE,
  normalizeServicioAlcance,
} from "../../domain/service/servicioAlcance.js";
import {
  autonomoDecaDatosFromProfile,
  mergeAutonomoDecaDatos,
} from "../../features/dcdt/decaAutonomoFormDefaults.js";

/** Alcance por parada de carga (`stops.notas` → `__CUADERNO_OP__`). */
export const CARGA_ALCANCE_META_KEY = "carga_alcance";

export function getCargaAlcance(stop) {
  const meta = getStopOperacionMeta(stop?.notas);
  return normalizeServicioAlcance(meta[CARGA_ALCANCE_META_KEY]);
}

export function isCargaNacional(stop) {
  return getCargaAlcance(stop) !== SERVICIO_ALCANCE.INTERNACIONAL;
}

export function listNacionalCargas(cargas) {
  return (cargas || []).filter(isCargaNacional);
}

function parsePlace(text) {
  const t = String(text || "").trim();
  if (!t) return { lugar: "", direccion: "", codigo_postal: "" };
  return { lugar: t, direccion: "", codigo_postal: "" };
}

function extractBestOcr(evidencias) {
  const cmrs = (evidencias || []).filter(evidenciaHasCmrOcr);
  if (!cmrs.length) return null;
  return cmrs[cmrs.length - 1]?.datos || null;
}

function mergeOcrFields(datos, ocr) {
  if (!ocr) return datos;
  const next = mergeAutonomoDecaDatos(datos);
  if (ocr.fecha) {
    const raw = String(ocr.fecha).trim();
    next.fecha = raw.length >= 10 ? raw.slice(0, 10) : raw;
  }
  if (ocr.remitente) {
    next.partes.cargador = { ...next.partes.cargador, nombre: String(ocr.remitente).trim() };
  }
  if (ocr.destinatario) {
    next.partes.destinatario = { ...next.partes.destinatario, nombre: String(ocr.destinatario).trim() };
  }
  if (ocr.lugar_carga) {
    next.origen = { ...next.origen, ...parsePlace(ocr.lugar_carga) };
  }
  if (ocr.lugar_entrega) {
    next.destino = { ...next.destino, ...parsePlace(ocr.lugar_entrega) };
  }
  if (ocr.mercancia) {
    next.mercancia = { ...next.mercancia, descripcion: String(ocr.mercancia).trim() };
  }
  if (ocr.peso_kg != null && String(ocr.peso_kg).trim()) {
    next.mercancia = { ...next.mercancia, peso_kg: ocr.peso_kg };
  }
  if (ocr.bultos != null && String(ocr.bultos).trim()) {
    next.mercancia = { ...next.mercancia, bultos: ocr.bultos };
  }
  if (ocr.matricula) {
    next.vehiculo = { ...next.vehiculo, matricula: String(ocr.matricula).trim() };
  }
  if (ocr.observaciones) {
    next.observaciones = String(ocr.observaciones).trim();
  }
  return next;
}

export function destinoForCarga(stops, cargaStop) {
  const sorted = [...(stops || [])].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  const cargaIdx = sorted.findIndex((s) => s.id === cargaStop?.id);
  if (cargaIdx >= 0) {
    const after = sorted.slice(cargaIdx + 1);
    const nextDescarga = after.find((s) => String(s.tipo).toLowerCase() === "descarga");
    if (nextDescarga) return nextDescarga;
  }
  return sorted.find((s) => String(s.tipo).toLowerCase() === "descarga") || null;
}

function stopToPlace(stop) {
  const meta = getStopOperacionMeta(stop?.notas);
  return {
    lugar: String(stop?.nombre || meta.empresa_logistica || "").trim(),
    direccion: String(stop?.direccion || "").trim(),
    codigo_postal: String(meta.codigo_postal || stop?.codigo_postal || "").trim(),
  };
}

/** Valores por defecto editables (transportista = autónomo, conductor = perfil). */
export function defaultExpedienteDecaPartes(profile = {}) {
  const fromProfile = autonomoDecaDatosFromProfile(profile);
  const t = fromProfile.partes?.transportista || {};
  const c = fromProfile.conductor || {};
  const v = fromProfile.vehiculo || {};
  return {
    transportista: {
      nombre: String(t.nombre || "").trim(),
      nif: String(t.nif || "").trim(),
      domicilio: String(t.domicilio || "").trim(),
    },
    conductor: {
      nombre: String(c.nombre || "").trim(),
      dni: String(c.dni || "").trim(),
      telefono: String(c.telefono || "").trim(),
    },
    vehiculo: {
      matricula: String(v.matricula || "").trim(),
      remolque: String(v.remolque || "").trim(),
    },
  };
}

export function buildDecaDatosFromExpedienteCarga({
  cargaStop,
  destinoStop,
  servicio,
  profile,
  evidencias = [],
  transportista = {},
  conductor = {},
  vehiculo = {},
}) {
  const srvMeta = getServicioOperacionMeta(servicio);
  let datos = autonomoDecaDatosFromProfile(profile);

  if (srvMeta.matricula) {
    datos.vehiculo = { ...datos.vehiculo, matricula: String(srvMeta.matricula).trim() };
  }
  if (srvMeta.remolque) {
    datos.vehiculo = { ...datos.vehiculo, remolque: String(srvMeta.remolque).trim() };
  }

  datos.origen = { ...datos.origen, ...stopToPlace(cargaStop) };

  const cargaMeta = getStopOperacionMeta(cargaStop?.notas);
  if (cargaMeta.cif) {
    datos.partes.cargador = { ...datos.partes.cargador, nif: String(cargaMeta.cif).trim() };
  }
  if (!String(datos.partes?.cargador?.nombre || "").trim() && cargaStop?.nombre) {
    datos.partes.cargador = { ...datos.partes.cargador, nombre: cargaStop.nombre };
  }
  const merc = cargaMeta.mercancia;
  if (merc && typeof merc === "object") {
    if (merc.descripcion) datos.mercancia = { ...datos.mercancia, descripcion: String(merc.descripcion).trim() };
    if (merc.peso_kg != null && String(merc.peso_kg).trim()) {
      datos.mercancia = { ...datos.mercancia, peso_kg: merc.peso_kg };
    }
    if (merc.bultos != null && String(merc.bultos).trim()) {
      datos.mercancia = { ...datos.mercancia, bultos: merc.bultos };
    }
    if (merc.palets != null && String(merc.palets).trim()) {
      datos.mercancia = { ...datos.mercancia, palets: merc.palets };
    }
  }
  if (cargaMeta.observaciones_carga) {
    datos.observaciones = String(cargaMeta.observaciones_carga).trim();
  }

  if (destinoStop) {
    datos.destino = { ...datos.destino, ...stopToPlace(destinoStop) };
    const destMeta = getStopOperacionMeta(destinoStop.notas);
    if (destMeta.destino_cliente) {
      datos.partes.destinatario = {
        ...datos.partes.destinatario,
        nombre: String(destMeta.destino_cliente).trim(),
      };
    } else if (destinoStop.nombre) {
      datos.partes.destinatario = {
        ...datos.partes.destinatario,
        nombre: String(destinoStop.nombre).trim(),
      };
    }
  }

  datos = mergeOcrFields(datos, extractBestOcr(evidencias));

  if (transportista?.nombre) {
    datos.partes.transportista = { ...datos.partes.transportista, nombre: transportista.nombre };
  }
  if (transportista?.nif) {
    datos.partes.transportista = { ...datos.partes.transportista, nif: transportista.nif };
  }
  if (transportista?.domicilio) {
    datos.partes.transportista = { ...datos.partes.transportista, domicilio: transportista.domicilio };
  }

  if (conductor?.nombre) datos.conductor = { ...datos.conductor, nombre: conductor.nombre };
  if (conductor?.dni) datos.conductor = { ...datos.conductor, dni: conductor.dni };
  if (conductor?.telefono) datos.conductor = { ...datos.conductor, telefono: conductor.telefono };

  if (vehiculo?.matricula) datos.vehiculo = { ...datos.vehiculo, matricula: String(vehiculo.matricula).trim() };
  if (vehiculo?.remolque != null) {
    datos.vehiculo = { ...datos.vehiculo, remolque: String(vehiculo.remolque || "").trim() };
  }

  datos.autonomo_expediente_servicio_id = servicio?.id || null;
  datos.autonomo_expediente_carga_stop_id = cargaStop?.id || null;

  return mergeAutonomoDecaDatos(datos);
}

/** Campos obligatorios mínimos DeCA (art. 6 simplificado autónomo). */
export function checkDecaReadinessForCarga({
  cargaStop,
  destinoStop,
  servicio,
  profile,
  transportista,
  conductor,
  vehiculo = {},
}) {
  const datos = buildDecaDatosFromExpedienteCarga({
    cargaStop,
    destinoStop,
    servicio,
    profile,
    evidencias: [],
    transportista,
    conductor,
    vehiculo,
  });
  const missing = [];
  if (!String(datos.partes?.cargador?.nombre || "").trim()) missing.push("Cargador contractual");
  if (!String(datos.partes?.transportista?.nombre || "").trim()) missing.push("Transportista efectivo");
  if (!String(datos.origen?.lugar || "").trim()) missing.push("Origen");
  if (!String(datos.destino?.lugar || "").trim()) missing.push("Destino");
  if (!String(datos.mercancia?.descripcion || "").trim()) missing.push("Mercancía / naturaleza");
  if (!String(datos.mercancia?.peso_kg ?? "").trim()) missing.push("Peso");
  if (!String(datos.fecha || "").trim()) missing.push("Fecha transporte");
  if (!String(datos.vehiculo?.matricula || "").trim()) missing.push("Matrícula tractora");
  const remolqueRequired = Boolean(String(profile?.remolque || vehiculo?.remolque || "").trim());
  if (remolqueRequired && !String(datos.vehiculo?.remolque || "").trim()) {
    missing.push("Matrícula remolque");
  }
  return { ok: missing.length === 0, missing, datos };
}

/** Genera DeCA de una carga nacional (antes del viaje). */
export async function generarDecaParaCarga({
  servicio,
  cargaStop,
  stops,
  evidenciasByStop,
  profile,
  transportista,
  conductor,
  vehiculo = {},
  userId,
  downloadAfter = true,
}) {
  if (!isCargaNacional(cargaStop)) {
    throw new Error("DeCA solo aplica a transporte nacional");
  }
  const destino = destinoForCarga(stops, cargaStop);
  const { ok, missing } = checkDecaReadinessForCarga({
    cargaStop,
    destinoStop: destino,
    servicio,
    profile,
    transportista,
    conductor,
    vehiculo,
  });
  if (!ok) {
    throw new Error(`Faltan datos para DeCA: ${missing.join(", ")}`);
  }

  const datos = buildDecaDatosFromExpedienteCarga({
    cargaStop,
    destinoStop: destino,
    servicio,
    profile,
    evidencias: evidenciasByStop?.[cargaStop.id] || [],
    transportista,
    conductor,
    vehiculo,
  });

  let deca = await createAutonomoDeca({ datos, userId, profile: null });
  const pdf = await generateAndPersistAutonomoDecaPdf(deca, { downloadAfter });
  deca = pdf.deca;

  return {
    decaId: deca.id,
    decaPublicId: deca.decaPublicId,
    cargaStopId: cargaStop.id,
    cargaNombre: cargaStop.nombre || "Carga",
    origen: datos.origen?.lugar || cargaStop.nombre,
    destino: datos.destino?.lugar || destino?.nombre || "—",
    downloadUrl: pdf.decaDownloadUrl,
    deca,
  };
}

export function previewNacionalDecas({ cargas, stops, servicio, profile, evidenciasByStop, transportista, conductor }) {
  return listNacionalCargas(cargas).map((carga) => {
    const destino = destinoForCarga(stops, carga);
    const datos = buildDecaDatosFromExpedienteCarga({
      cargaStop: carga,
      destinoStop: destino,
      servicio,
      profile,
      evidencias: evidenciasByStop?.[carga.id] || [],
      transportista,
      conductor,
    });
    return {
      cargaStopId: carga.id,
      cargaNombre: carga.nombre || "Carga",
      origen: datos.origen?.lugar || carga.nombre,
      destino: datos.destino?.lugar || destino?.nombre || "—",
      matricula: datos.vehiculo?.matricula || "—",
    };
  });
}

/** Crea y genera PDF DeCA por cada carga nacional del expediente. */
export async function generarDecasParaExpediente({
  servicio,
  cargas,
  stops,
  evidenciasByStop,
  profile,
  transportista,
  conductor,
  userId,
  downloadAfter = false,
}) {
  const nacional = listNacionalCargas(cargas);
  const results = [];

  for (const carga of nacional) {
    const destino = destinoForCarga(stops, carga);
    const datos = buildDecaDatosFromExpedienteCarga({
      cargaStop: carga,
      destinoStop: destino,
      servicio,
      profile,
      evidencias: evidenciasByStop?.[carga.id] || [],
      transportista,
      conductor,
    });

    let deca = await createAutonomoDeca({ datos, userId, profile: null });
    const pdf = await generateAndPersistAutonomoDecaPdf(deca, { downloadAfter });
    deca = pdf.deca;

    results.push({
      decaId: deca.id,
      decaPublicId: deca.decaPublicId,
      cargaStopId: carga.id,
      cargaNombre: carga.nombre || "Carga",
      origen: datos.origen?.lugar || carga.nombre,
      destino: datos.destino?.lugar || destino?.nombre || "—",
      downloadUrl: pdf.decaDownloadUrl,
    });
  }

  return results;
}
