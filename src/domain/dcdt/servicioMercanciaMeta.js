import { getServicioOperacionMeta } from "../service/serviceOperacionMeta.js";

/** Mercancía del servicio en meta de `referencia` (sin columnas nuevas). */

export function emptyServicioMercancia() {
  return {
    descripcion: "",
    palets: "",
    bultos: "",
    peso_kg: "",
  };
}

export function getServicioMercanciaFromMeta(servicioOrReferencia) {
  const meta = getServicioOperacionMeta(
    typeof servicioOrReferencia === "object" && servicioOrReferencia !== null
      ? servicioOrReferencia
      : { referencia: servicioOrReferencia },
  );
  const m = meta.mercancia_servicio;
  if (!m || typeof m !== "object") return emptyServicioMercancia();
  return {
    descripcion: String(m.descripcion || "").trim(),
    palets: m.palets == null || m.palets === "" ? "" : String(m.palets),
    bultos: m.bultos == null || m.bultos === "" ? "" : String(m.bultos),
    peso_kg: m.peso_kg == null || m.peso_kg === "" ? "" : String(m.peso_kg),
  };
}

export function servicioMercanciaToMeta(mercancia) {
  const m = mercancia || emptyServicioMercancia();
  const descripcion = String(m.descripcion || "").trim();
  const palets = parseOptionalNumber(m.palets);
  const bultos = parseOptionalNumber(m.bultos);
  const peso_kg = parseOptionalNumber(m.peso_kg);
  if (!descripcion && palets == null && bultos == null && peso_kg == null) {
    return { mercancia_servicio: null };
  }
  return {
    mercancia_servicio: {
      descripcion: descripcion || null,
      palets,
      bultos,
      peso_kg,
    },
  };
}

function parseOptionalNumber(val) {
  if (val == null || val === "") return null;
  const n = Number(String(val).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function buildServicioMercanciaMetaPatch(mercancia) {
  return servicioMercanciaToMeta(mercancia);
}
