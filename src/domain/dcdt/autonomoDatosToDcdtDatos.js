import { mergeAutonomoDecaDatos } from "../../features/dcdt/decaAutonomoFormDefaults.js";
import { resolveServiceRouteEndpoints } from "../service/serviceIdentity.js";

function str(v) {
  return String(v ?? "").trim();
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parteOverrides(parte, domicilioFallback) {
  return {
    nombre: str(parte?.nombre) || null,
    nif: str(parte?.nif) || null,
    domicilio: str(parte?.domicilio) || str(parte?.direccion) || str(domicilioFallback) || null,
  };
}

/**
 * Copia el formulario de Mis DeCA al JSON de dcdt_servicio (partes override + vehículo).
 */
export function autonomoDatosToDcdtDatos(autonomoDatos = {}, extras = {}) {
  const d = mergeAutonomoDecaDatos(autonomoDatos);
  const origenLugar = str(d.origen?.lugar);
  const destinoLugar = str(d.destino?.lugar);
  const origenDom = str(d.origen?.direccion) || origenLugar;
  const destinoDom = str(d.destino?.direccion) || destinoLugar;

  return {
    partes: {
      cargador_id: null,
      cargador_overrides: parteOverrides(d.partes?.cargador, origenDom),
      destinatario_id: null,
      destinatario_overrides: parteOverrides(d.partes?.destinatario, destinoDom),
    },
    mercancia: {
      descripcion: str(d.mercancia?.descripcion) || null,
      peso_kg: numOrNull(d.mercancia?.peso_kg),
      bultos: numOrNull(d.mercancia?.bultos),
      palets: numOrNull(d.mercancia?.palets),
    },
    transportista: { use_empresa: true },
    vehiculo: {
      use_conductor_matricula: false,
      matricula_override: str(d.vehiculo?.matricula) || null,
      remolque_override: str(d.vehiculo?.remolque) || null,
    },
    stops: [],
    observaciones: str(d.observaciones),
    origen_lugar_override: origenLugar || null,
    destino_lugar_override: destinoLugar || null,
    emitido_por_conductor: true,
    vinculado_deca_autonomo_id: extras.autonomoDecaId || null,
  };
}

/** Prefill del formulario autónomo desde el viaje de flota. */
export function buildConductorDecaFormSeed({ servicio, stops = [], empresa = null, conductor = null } = {}) {
  const ep = resolveServiceRouteEndpoints(servicio, stops);
  const genericO = !ep.origen || /^inicio servicio$/i.test(ep.origen);
  const genericD = !ep.destino || /^destino$/i.test(ep.destino);
  return {
    origen: genericO ? undefined : { lugar: ep.origen },
    destino: genericD ? undefined : { lugar: ep.destino },
    vehiculo: {
      matricula: str(conductor?.matricula),
      remolque: str(conductor?.remolque),
    },
    partes: {
      transportista: {
        nombre: str(empresa?.nombre),
        nif: str(empresa?.cif),
      },
    },
    conductor: {
      nombre: str(conductor?.nombre),
    },
  };
}

export function isAutonomoDecaLinkedToServicio(deca) {
  return !!str(deca?.datos?.vinculado_servicio_id);
}

export function canLinkAutonomoDecaToServicio(deca) {
  if (!deca?.id) return false;
  const st = String(deca.estado || "").toLowerCase();
  if (st === "archivado") return false;
  return !isAutonomoDecaLinkedToServicio(deca);
}

/** Reabre el formulario autónomo desde un dcdt_servicio emitido por el conductor. */
export function dcdtDatosToAutonomoSeed(datos = {}) {
  const cargador = datos.partes?.cargador_overrides || {};
  const destinatario = datos.partes?.destinatario_overrides || {};
  return {
    origen: { lugar: str(datos.origen_lugar_override) },
    destino: { lugar: str(datos.destino_lugar_override) },
    vehiculo: {
      matricula: str(datos.vehiculo?.matricula_override),
      remolque: str(datos.vehiculo?.remolque_override),
    },
    partes: {
      cargador: { nombre: str(cargador.nombre), nif: str(cargador.nif) },
      destinatario: { nombre: str(destinatario.nombre), nif: str(destinatario.nif) },
    },
    mercancia: {
      descripcion: str(datos.mercancia?.descripcion),
      peso_kg: datos.mercancia?.peso_kg ?? "",
      bultos: datos.mercancia?.bultos ?? "",
      palets: datos.mercancia?.palets ?? "",
    },
    observaciones: str(datos.observaciones),
  };
}
