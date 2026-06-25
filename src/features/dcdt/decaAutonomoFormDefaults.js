import { DECA_PORTES_OPTIONS } from "../../domain/dcdt/decaAutonomoConstants.js";

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyAutonomoDecaDatos() {
  return {
    fecha: todayIsoDate(),
    vehiculo: { matricula: "", remolque: "" },
    origen: { lugar: "", direccion: "", codigo_postal: "" },
    destino: { lugar: "", direccion: "", codigo_postal: "" },
    partes: {
      cargador: { nombre: "", nif: "" },
      transportista: { nombre: "", nif: "" },
      destinatario: { nombre: "", nif: "" },
    },
    mercancia: {
      descripcion: "",
      bultos: "",
      palets: "",
      peso_kg: "",
      portes: DECA_PORTES_OPTIONS[2].id,
    },
    conductor: { nombre: "", dni: "", telefono: "" },
    observaciones: "",
  };
}

/** Autorrelleno desde perfil conductor / autónomo. */
export function autonomoDecaDatosFromProfile(prof = {}) {
  const base = emptyAutonomoDecaDatos();
  const nombre = String(prof.nombre || "").trim();
  const empresa = String(prof.empresa || "").trim();
  const transportistaNombre = empresa || nombre;
  return {
    ...base,
    vehiculo: {
      matricula: String(prof.matricula || "").trim(),
      remolque: String(prof.remolque || "").trim(),
    },
    partes: {
      ...base.partes,
      transportista: {
        nombre: transportistaNombre,
        nif: String(prof.cif || "").trim(),
      },
    },
    conductor: {
      nombre,
      dni: String(prof.dni || "").trim(),
      telefono: String(prof.telefono || "").trim(),
    },
  };
}

export function mergeAutonomoDecaDatos(stored) {
  const base = emptyAutonomoDecaDatos();
  const d = stored && typeof stored === "object" ? stored : {};
  return {
    ...base,
    ...d,
    vehiculo: { ...base.vehiculo, ...(d.vehiculo || {}) },
    origen: { ...base.origen, ...(d.origen || {}) },
    destino: { ...base.destino, ...(d.destino || {}) },
    partes: {
      cargador: { ...base.partes.cargador, ...(d.partes?.cargador || {}) },
      transportista: { ...base.partes.transportista, ...(d.partes?.transportista || {}) },
      destinatario: { ...base.partes.destinatario, ...(d.partes?.destinatario || {}) },
    },
    mercancia: { ...base.mercancia, ...(d.mercancia || {}) },
    conductor: { ...base.conductor, ...(d.conductor || {}) },
  };
}
