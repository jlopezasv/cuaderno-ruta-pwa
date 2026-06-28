const TYPE_RANK = Object.freeze({
  expediente_iniciado: 5,
  carga_preparada: 12,
  carga_registrada: 12,
  destino_anadido: 12,
  nueva_carga: 12,
  retorno: 12,
  entrada_muelle: 30,
  entrega_llegada: 30,
  deca_generado: 40,
  ocr_cmr: 45,
  foto_cmr: 45,
  foto_carga: 45,
  foto_mercancia: 45,
  documento: 45,
  incidencia: 46,
  pod: 46,
  salida_muelle: 50,
  entrega_salida: 50,
  entrega_completada: 52,
  expediente_generado: 90,
  expediente_finalizado: 90,
  expediente_archivado: 95,
});

function typeRank(type) {
  return TYPE_RANK[String(type || "").toLowerCase()] ?? 55;
}

function parseTs(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Orden operacional: hora → orden de parada → tipo de evento.
 */
export function sortAutonomoTimelineEvents(events, stops = []) {
  const ordenByStop = Object.fromEntries(
    (stops || []).map((s) => [s.id, Number(s.orden) || 0]),
  );
  return [...(events || [])].sort((a, b) => {
    const ta = parseTs(a.at);
    const tb = parseTs(b.at);
    if (ta != null && tb != null && ta !== tb) return ta - tb;
    if (ta == null && tb != null) return 1;
    if (ta != null && tb == null) return -1;
    const oa = ordenByStop[a.stopId] ?? 9999;
    const ob = ordenByStop[b.stopId] ?? 9999;
    if (oa !== ob) return oa - ob;
    const ra = typeRank(a.type);
    const rb = typeRank(b.type);
    if (ra !== rb) return ra - rb;
    return String(a.label || "").localeCompare(String(b.label || ""), "es");
  });
}
