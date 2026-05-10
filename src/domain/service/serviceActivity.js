/**
 * Última actividad visible de un servicio a partir de datos ya cargados.
 * Prioridad de señales (se usa el instante más reciente entre todas):
 * evidencias → paradas (llegada/salida/actualización) → fecha_inicio → created_at
 */

function parseMs(v) {
  if (v == null || v === "") return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function maxEvidenceMs(evidencias) {
  let max = null;
  if (Array.isArray(evidencias)) {
    for (const ev of evidencias) {
      const t = parseMs(ev?.created_at);
      if (t != null && (max == null || t > max)) max = t;
    }
    return max;
  }
  if (evidencias && typeof evidencias === "object") {
    for (const arr of Object.values(evidencias)) {
      if (!Array.isArray(arr)) continue;
      for (const ev of arr) {
        const t = parseMs(ev?.created_at);
        if (t != null && (max == null || t > max)) max = t;
      }
    }
  }
  return max;
}

function maxStopActivityMs(stops) {
  let max = null;
  const fields = ["hora_salida_real", "hora_llegada_real", "updated_at", "created_at"];
  for (const st of stops || []) {
    for (const f of fields) {
      const t = parseMs(st?.[f]);
      if (t != null && (max == null || t > max)) max = t;
    }
  }
  return max;
}

function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatActivityLabel(tsMs, nowMs = Date.now()) {
  const dTs = new Date(tsMs);
  const dNow = new Date(nowMs);
  let diff = nowMs - tsMs;
  if (diff < 0) diff = 0;

  if (sameLocalDay(dTs, dNow)) {
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Hace un momento";
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(diff / 3600000);
    return `Hace ${hrs} h`;
  }

  const startToday = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  if (tsMs >= startYesterday.getTime() && tsMs < startToday.getTime()) return "Ayer";

  const days = Math.floor(diff / 86400000);
  if (days < 7) return `Hace ${days} días`;

  return dTs.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    ...(dTs.getFullYear() !== dNow.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function getLastServiceActivity({ service, stops, evidencias }) {
  const evMs = maxEvidenceMs(evidencias);
  const stopMs = maxStopActivityMs(stops);
  const iniMs = parseMs(service?.fecha_inicio);
  const creMs = parseMs(service?.created_at);

  const candidates = [evMs, stopMs, iniMs, creMs].filter((t) => t != null);
  const ts = candidates.length ? Math.max(...candidates) : creMs ?? iniMs ?? Date.now();

  return {
    ts,
    label: formatActivityLabel(ts),
  };
}
