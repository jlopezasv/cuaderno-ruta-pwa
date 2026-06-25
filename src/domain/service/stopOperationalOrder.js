/**
 * Orden operacional de paradas (`stops.orden` / alias `orden_operacional`).
 * Tráfico define la secuencia; conductor y expediente la respetan.
 */

function stopOperationalGroup(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "carga") return "carga";
  if (t === "descarga") return "descarga";
  if (t.includes("carga") && t.includes("descarga")) return "carga_descarga";
  return "otra";
}

export function getStopOrdenOperacional(stop) {
  const n = Number(stop?.orden_operacional ?? stop?.orden ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function sortStopsByOrdenOperacional(stops) {
  return [...(stops || [])].sort(
    (a, b) => getStopOrdenOperacional(a) - getStopOrdenOperacional(b),
  );
}

/** Reasigna orden 1..n tras mover, insertar o eliminar. */
export function normalizeStopsOrden(stops) {
  return sortStopsByOrdenOperacional(stops).map((s, idx) => ({
    ...s,
    orden: idx + 1,
    orden_operacional: idx + 1,
  }));
}

export function moveStopAtIndex(stops, index, direction) {
  const arr = sortStopsByOrdenOperacional(stops);
  const j = index + direction;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[j]] = [next[j], next[index]];
  return normalizeStopsOrden(next);
}

export function removeStopAtIndex(stops, index) {
  const sorted = sortStopsByOrdenOperacional(stops);
  if (sorted.length <= 1) return sorted;
  return normalizeStopsOrden(sorted.filter((_, i) => i !== index));
}

export function insertStopAfterIndex(stops, index, newStop) {
  const sorted = sortStopsByOrdenOperacional(stops);
  const arr = [...sorted];
  const insertAt = Math.min(Math.max(0, index) + 1, arr.length);
  arr.splice(insertAt, 0, newStop);
  return normalizeStopsOrden(arr);
}

export function appendOperationalStop(stops, newStop) {
  return normalizeStopsOrden([...sortStopsByOrdenOperacional(stops), newStop]);
}

function tipoOrdenLabelForStop(stop, counters) {
  const g = stopOperationalGroup(stop?.tipo);
  if (g === "carga") return `Carga ${counters.carga}`;
  if (g === "descarga") return `Descarga ${counters.descarga}`;
  if (g === "carga_descarga") return `Carga/descarga ${counters.carga_descarga}`;
  return `Parada ${counters.otra || getStopOrdenOperacional(stop) || ""}`.trim();
}

const TITLE_ICON = {
  carga: "📦",
  descarga: "📤",
  carga_descarga: "⇄",
  otra: "📍",
};

/** Título UI según posición en la ruta operacional (Carga 1, Carga 2, Descarga 1…). */
export function stopOperationalTitleAt(stopsInDisplayOrder, index) {
  const list = Array.isArray(stopsInDisplayOrder) ? stopsInDisplayOrder : [];
  const stop = list[index];
  if (!stop) return "📍 Parada";
  const counters = { carga: 0, descarga: 0, carga_descarga: 0, otra: 0 };
  for (let i = 0; i <= index; i++) {
    const s = list[i];
    const g = stopOperationalGroup(s?.tipo);
    counters[g] = (counters[g] || 0) + 1;
    if (i === index) {
      const icon = TITLE_ICON[g] || "📍";
      return `${icon} ${tipoOrdenLabelForStop(s, counters)}`;
    }
  }
  return "📍 Parada";
}
