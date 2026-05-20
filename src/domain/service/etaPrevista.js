import { formatOperationalEtaLabel } from "./etaFormatter.js";
import { getServicioOperacionMeta } from "./serviceOperacionMeta.js";

function formatDurationMins(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (!Number.isFinite(m) || m <= 0) return null;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

/**
 * Snapshot mínimo de ETA prevista (solo planificación al calcular ruta).
 * Se guarda en `referencia` → meta `eta_prevista`, sin acoplar a paradas ni timeline.
 */
export function buildEtaPrevistaSnapshot({ arrivalAt, durationMins, km }) {
  const raw = arrivalAt == null ? "" : String(arrivalAt).trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  const mins = Number(durationMins);
  const kmN = Number(km);
  const duration_mins = Number.isFinite(mins) ? Math.max(0, Math.round(mins)) : null;
  const kmRounded = Number.isFinite(kmN) ? Math.round(kmN * 10) / 10 : null;

  return {
    calculated_at: new Date().toISOString(),
    arrival_at: d.toISOString(),
    arrival_label: formatOperationalEtaLabel(d) || null,
    duration_mins,
    duration_label: duration_mins != null ? formatDurationMins(duration_mins) : null,
    km: kmRounded,
  };
}

/** Desde el resultado de `buildOperationalPlanSnapshot` u homólogo. */
export function buildEtaPrevistaFromRoutePlan(plan) {
  if (!plan || plan.status !== "ok" || !plan.planned_eta) return null;
  return buildEtaPrevistaSnapshot({
    arrivalAt: plan.planned_eta,
    durationMins: plan.planned_drive_min,
    km: plan.planned_km,
  });
}

export function getEtaPrevista(servicio) {
  const snap = getServicioOperacionMeta(servicio)?.eta_prevista;
  return snap && typeof snap === "object" ? snap : null;
}

export function formatEtaPrevistaRestLine(eta) {
  if (!eta) return null;
  const parts = [];
  if (eta.duration_label) parts.push(eta.duration_label);
  if (Number.isFinite(Number(eta.km)) && Number(eta.km) > 0) {
    const k = Number(eta.km);
    parts.push(`${k >= 100 ? Math.round(k) : k} km`);
  }
  return parts.length ? parts.join(" · ") : null;
}
