function str(v) {
  return String(v ?? "").trim();
}

/** Origen/destino del PDF: lo que escribió el conductor, si no las paradas del viaje. */
export function pickDcdtRoutePlace(routeValue, override) {
  const ov = str(override);
  if (ov) return ov;
  return str(routeValue);
}
