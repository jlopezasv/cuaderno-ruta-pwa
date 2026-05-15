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

/** "2h 14m · 187 km" para panel flota (duración y distancia restantes al cálculo). */
export function formatEmpresaOperationalRestLine(remainingMins, remainingKm) {
  const parts = [];
  if (Number.isFinite(remainingMins) && remainingMins > 0) {
    const h = Math.floor(remainingMins / 60);
    const m = Math.round(remainingMins % 60);
    if (h > 0) parts.push(`${h}h${m > 0 ? ` ${m}m` : ""}`.trim());
    else parts.push(`${m}m`);
  }
  if (Number.isFinite(remainingKm) && remainingKm > 0) {
    parts.push(`${remainingKm >= 100 ? Math.round(remainingKm) : Math.round(remainingKm * 10) / 10} km`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

/** "hace 8 min" / "hace 1 h" respecto a un ISO (último cálculo persistido). */
export function formatSpanishAgo(iso, now = new Date()) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, now.getTime() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}
