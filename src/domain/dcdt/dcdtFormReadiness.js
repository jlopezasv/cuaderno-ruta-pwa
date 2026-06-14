import { suggestParteTipoForStop } from "./partesTransporteModel.js";

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

function parteFromCatalog(partesById, stop) {
  const id = stop?.parte_transporte_id;
  if (!id) return null;
  return partesById?.[id] || null;
}

function ubicacionState(stop) {
  const ciudad = hasText(stop?.nombre);
  const dir = hasText(stop?.direccion);
  return triState(ciudad && dir, ciudad || dir);
}

/**
 * Indicador visual de datos para futuro DCDT (no bloquea guardado).
 * status: completo | parcial | pendiente
 */
export function assessDcdtFormReadiness({
  stops = [],
  mercancia = {},
  partesById = {},
  fechaInicio = null,
  matricula = null,
  remolque = null,
  tipoVehiculo = "articulado",
}) {
  const carga = firstStopOfTipo(stops, "carga");
  const descarga = lastStopOfTipo(stops, "descarga");
  const cargador = parteFromCatalog(partesById, carga);
  const destinatario = parteFromCatalog(partesById, descarga);
  const rigido = String(tipoVehiculo || "").toLowerCase() === "rigido";

  const hasCargadorLink = Boolean(carga?.parte_transporte_id);
  const hasDestLink = Boolean(descarga?.parte_transporte_id);

  const items = [
    item("Cargador contractual", triState(hasCargadorLink, false)),
    item(
      "CIF cargador",
      triState(hasText(cargador?.nif), hasCargadorLink && !hasText(cargador?.nif)),
    ),
    item(
      "Domicilio cargador",
      triState(
        hasText(cargador?.domicilioFiscal) || hasText(cargador?.direccionOperativa),
        hasCargadorLink && !(hasText(cargador?.domicilioFiscal) || hasText(cargador?.direccionOperativa)),
      ),
    ),
    item("Destinatario", triState(hasDestLink, false)),
    item(
      "CIF destinatario",
      triState(hasText(destinatario?.nif), hasDestLink && !hasText(destinatario?.nif)),
    ),
    item(
      "Domicilio destinatario",
      triState(
        hasText(destinatario?.domicilioFiscal) || hasText(destinatario?.direccionOperativa),
        hasDestLink && !(hasText(destinatario?.domicilioFiscal) || hasText(destinatario?.direccionOperativa)),
      ),
    ),
    item("Origen", ubicacionState(carga)),
    item("Destino", ubicacionState(descarga)),
    item("Mercancía", triState(hasText(mercancia?.descripcion), false)),
    item(
      "Peso",
      triState(hasText(mercancia?.peso_kg), hasText(mercancia?.descripcion) && !hasText(mercancia?.peso_kg)),
    ),
    item("Matrícula tractora", triState(hasText(matricula), false)),
    item(
      "Matrícula remolque",
      rigido ? "completo" : triState(hasText(remolque), hasText(matricula) && !hasText(remolque)),
    ),
    item("Fecha transporte", triState(hasText(fechaInicio), false)),
  ];

  return {
    items,
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
