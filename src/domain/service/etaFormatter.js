const WEEKDAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function parseEtaDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatOperationalEtaLabel(value, now = new Date()) {
  const d = parseEtaDate(value);
  if (!d) return null;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const diffMs = d.getTime() - now.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (diffMs >= 0 && diffMs < sevenDaysMs) {
    return `${WEEKDAYS_LONG[d.getDay()]} · ${time}`;
  }
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} · ${time}`;
}

export function isRelativeEtaLabel(value) {
  return /\b(hoy|mañana|pasado mañana|en \d+ d[ií]as)\b/i.test(String(value || ""));
}

export function formatOperationalEtaSlot(slot, now = new Date()) {
  if (!slot) return "—";
  const formatted = formatOperationalEtaLabel(slot.eta || slot.planned_eta || slot.arrival, now);
  if (formatted) return formatted;
  return slot.label && slot.label !== "Sin ETA" && slot.label !== "…" && !isRelativeEtaLabel(slot.label) ? String(slot.label) : "—";
}
