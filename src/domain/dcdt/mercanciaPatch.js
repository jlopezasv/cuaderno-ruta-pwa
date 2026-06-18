import { formatDcdtDisplayValue } from "./dcdtDisplayText.js";

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
