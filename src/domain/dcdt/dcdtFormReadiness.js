import { DCDT_ESTADO } from "./dcdtConstants.js";
import { buildMercanciaDatosPatch, resolveDcdtDocument } from "./dcdtModel.js";
import { suggestParteTipoForStop } from "./partesTransporteModel.js";
import { getStopOperacionMeta } from "../service/stopOperacionMeta.js";

function hasText(val) {
  return Boolean(String(val || "").trim());
}

function triState(required, partial) {
  if (required) return "completo";
  if (partial) return "parcial";
  return "pendiente";
}

function item(label, status) {
  return { label, status };
}

function firstStopOfTipo(stops, tipo) {
  return (stops || []).find((s) => String(s?.tipo || "").toLowerCase() === tipo) || null;
}

function lastStopOfTipo(stops, tipo) {
  const hits = (stops || []).filter((s) => String(s?.tipo || "").toLowerCase() === tipo);
  return hits.length ? hits[hits.length - 1] : null;
}

function stopParteTransporteId(stop) {
  if (!stop) return null;
  return stop.parte_transporte_id || getStopOperacionMeta(stop.notas)?.parte_transporte_id || null;
}

function missingHas(missing, key) {
  return (missing || []).some((m) => m.key === key);
}

function ubicacionState(stop) {
  const ciudad = hasText(stop?.nombre);
  const dir = hasText(stop?.direccion);
  return triState(ciudad && dir, ciudad || dir);
}

/**
 * Misma resolución que validateDcdtReadiness / EmpresaDcdtModal, con DCDT sintético en formulario.
 */
export function resolveDcdtReadinessFromForm({
  stops = [],
  mercancia = {},
  partesById = {},
  fechaInicio = null,
  matricula = null,
  remolque = null,
  tipoVehiculo = "articulado",
  empresa = null,
  empresaOwnerProfile = null,
  dcdt = null,
  servicio = null,
}) {
  const syntheticServicio = servicio || { fecha_inicio: fechaInicio || null };
  const syntheticDcdt =
    dcdt ||
    ({
      estado: DCDT_ESTADO.BORRADOR,
      datos: {
        partes: {
          cargador_id: null,
          cargador_overrides: {},
          destinatario_id: null,
          destinatario_overrides: {},
        },
        mercancia: buildMercanciaDatosPatch(mercancia),
        transportista: { use_empresa: true },
        vehiculo: { use_conductor_matricula: true, matricula_override: null },
        stops: [],
      },
    });

  return resolveDcdtDocument({
    servicio: syntheticServicio,
    stops,
    dcdt: syntheticDcdt,
    masterById: partesById,
    empresa,
    empresaOwnerProfile,
    conductor: { matricula, remolque },
  });
}

/**
 * Indicador visual de datos para futuro DCDT (no bloquea guardado).
 * status: completo | parcial | pendiente
 */
export function assessDcdtFormReadiness(args) {
  const {
    stops = [],
    mercancia = {},
    partesById = {},
    fechaInicio = null,
    matricula = null,
    remolque = null,
    tipoVehiculo = "articulado",
  } = args;

  const { doc, missing, datos } = resolveDcdtReadinessFromForm(args);
  const rigido = String(tipoVehiculo || "").toLowerCase() === "rigido";

  const carga = firstStopOfTipo(stops, "carga");
  const descarga = lastStopOfTipo(stops, "descarga");
  const hasCargadorLink = Boolean(datos?.partes?.cargador_id || stopParteTransporteId(carga));
  const items = [
    item(
      "Cargador contractual",
      triState(
        !missingHas(missing, "cargador.nombre"),
        hasCargadorLink &&
          (missingHas(missing, "cargador.nombre") ||
            missingHas(missing, "cargador.nif") ||
            missingHas(missing, "cargador.domicilio")),
      ),
    ),
    item(
      "CIF cargador",
      triState(
        hasText(doc?.cargador?.nif),
        hasCargadorLink && missingHas(missing, "cargador.nif"),
      ),
    ),
    item(
      "Domicilio cargador",
      triState(
        hasText(doc?.cargador?.domicilio),
        hasCargadorLink && missingHas(missing, "cargador.domicilio"),
      ),
    ),
    item("Origen", ubicacionState(carga)),
    item("Destino", ubicacionState(descarga)),
    item(
      "Mercancía",
      triState(hasText(doc?.mercancia?.descripcion), missingHas(missing, "mercancia.descripcion")),
    ),
    item(
      "Peso",
      triState(
        doc?.mercancia?.peso_kg != null && doc?.mercancia?.peso_kg !== "",
        hasText(doc?.mercancia?.descripcion) && missingHas(missing, "mercancia.peso_kg"),
      ),
    ),
    item("Matrícula tractora", triState(hasText(doc?.vehiculo?.matricula), missingHas(missing, "vehiculo.matricula"))),
    item(
      "Matrícula remolque",
      rigido
        ? "completo"
        : triState(
            hasText(doc?.vehiculo?.remolque),
            hasText(doc?.vehiculo?.matricula) && !hasText(doc?.vehiculo?.remolque),
          ),
    ),
    item(
      "Fecha transporte",
      triState(hasText(fechaInicio) || hasText(doc?.fecha_transporte), missingHas(missing, "fecha_transporte")),
    ),
  ];

  return {
    items,
    doc,
    missing,
    completeCount: items.filter((i) => i.status === "completo").length,
    partialCount: items.filter((i) => i.status === "parcial").length,
    totalCount: items.length,
  };
}

export function dcdtStatusIcon(status) {
  if (status === "completo") return "🟢";
  if (status === "parcial") return "🟠";
  return "🔴";
}

export function dcdtStatusLabel(status) {
  if (status === "completo") return "completo";
  if (status === "parcial") return "pendiente parcial";
  return "pendiente";
}

export function stopContractualTitle(stop, index) {
  const n = index + 1;
  const t = String(stop?.tipo || "").toLowerCase();
  if (t === "carga") return `📦 Carga #${n}`;
  if (t === "descarga") return `📤 Descarga #${n}`;
  return `📍 Parada #${n}`;
}

export function stopContractualBlockLabel(stop) {
  const t = String(stop?.tipo || "").toLowerCase();
  if (t === "carga") return "Cargador contractual";
  if (t === "descarga") return "Destinatario";
  return "Parte contractual";
}

export function filterPartesForStop(partes, stop) {
  const parteTipo = stop?.parte_transporte_tipo || suggestParteTipoForStop(stop?.tipo);
  const t = String(parteTipo || "").toLowerCase();
  return (partes || []).filter((p) => {
    const pt = String(p.tipo || "").toLowerCase();
    if (t === "cargador") return pt === "cargador" || pt === "expedidor";
    if (t === "destinatario") return pt === "destinatario";
    return pt === t || pt === "operador";
  });
}

export function applyParteUbicacionToStop(parte, onChange, index) {
  if (!parte || !onChange) return;
  if (hasText(parte.direccionOperativa)) onChange(index, "direccion", parte.direccionOperativa.trim());
  if (hasText(parte.ciudad)) onChange(index, "nombre", parte.ciudad.trim());
  if (hasText(parte.codigoPostal)) onChange(index, "codigo_postal", parte.codigoPostal.trim());
  if (hasText(parte.pais)) onChange(index, "pais", parte.pais.trim());
}
