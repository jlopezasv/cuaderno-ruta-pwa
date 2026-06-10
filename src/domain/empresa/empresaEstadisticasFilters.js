/** Filtros y presets de la pestaña Estadísticas operativas (panel empresa). */

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDateInputValue(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function startOfDayIso(dateStr) {
  if (!dateStr) return null;
  return `${dateStr}T00:00:00.000Z`;
}

export function endOfDayIso(dateStr) {
  if (!dateStr) return null;
  return `${dateStr}T23:59:59.999Z`;
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export const DATE_PRESETS = Object.freeze({
  last7: "last7",
  last30: "last30",
  thisMonth: "thisMonth",
  prevMonth: "prevMonth",
});

export function createDefaultEstadisticasFilters(now = new Date()) {
  const hasta = toDateInputValue(now);
  const desde = toDateInputValue(addDays(now, -30));
  return {
    fechaDesde: desde,
    fechaHasta: hasta,
    cliente: "",
    conductorId: "",
    estadoServicio: "",
    origen: "",
    destino: "",
    tipoDocumento: "",
    tipoIncidencia: "",
    remitenteCmr: "",
    destinatarioCmr: "",
    mercanciaCmr: "",
    matricula: "",
    conCmr: "",
    conIncidencias: "",
    conDocumentos: "",
  };
}

export function applyDatePreset(filters, preset, now = new Date()) {
  const base = { ...(filters || createDefaultEstadisticasFilters(now)) };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case DATE_PRESETS.last7:
      base.fechaDesde = toDateInputValue(addDays(today, -6));
      base.fechaHasta = toDateInputValue(today);
      break;
    case DATE_PRESETS.last30:
      base.fechaDesde = toDateInputValue(addDays(today, -29));
      base.fechaHasta = toDateInputValue(today);
      break;
    case DATE_PRESETS.thisMonth:
      base.fechaDesde = toDateInputValue(startOfMonth(today));
      base.fechaHasta = toDateInputValue(today);
      break;
    case DATE_PRESETS.prevMonth: {
      const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      base.fechaDesde = toDateInputValue(startOfMonth(prev));
      base.fechaHasta = toDateInputValue(endOfMonth(prev));
      break;
    }
    default:
      break;
  }
  return base;
}

export function clearEstadisticasFilters(now = new Date()) {
  return createDefaultEstadisticasFilters(now);
}

export function hasValidDateRange(filters) {
  return !!(filters?.fechaDesde && filters?.fechaHasta);
}
