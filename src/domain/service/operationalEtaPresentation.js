import {
  getOperationalEtaSnapshot,
  getOperationalPlanConfirmedAt,
  getOperationalPlanSnapshot,
  getOperationalTripStartedAt,
} from "./serviceOperacionMeta.js";
import {
  formatEmpresaOperationalRestLine,
  formatOperationalEtaLabel,
  formatSpanishAgo,
  isRelativeEtaLabel,
} from "./etaFormatter.js";

/** Sin ETA dinámica todavía (solo UI). */
export const OPERATIONAL_ETA_CALCULATING = "Calculando ETA actual…";

/** Tick compartido empresa/conductor para textos auxiliares (“hace X min”), no para la hora ETA. */
export const ETA_UI_VISUAL_TICK_MS = 5 * 60 * 1000;

export const ETA_LABEL_INICIAL = "ETA inicial";
export const ETA_LABEL_ACTUAL = "ETA actual";

/** Destino/ruta confirmados con «Añadir destino a la ruta» (`operational_plan_confirmed_at`). */
export function hasActiveRouteDestination(servicio) {
  return !!getOperationalPlanConfirmedAt(servicio);
}

/** Etiqueta de hora estable (no depende del reloj de la UI). */
export function formatStableEtaClockLabel(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return formatOperationalEtaLabel(value, d);
}

/** ETA actual: solo valor guardado en servicio, sin capa “live”. */
export function resolvePersistedEtaActualLabel(operationalEta) {
  if (!operationalEta?.eta) return null;
  const stored = operationalEta.label || operationalEta.eta_label;
  if (stored && !isRelativeEtaLabel(stored)) return String(stored).trim();
  return formatStableEtaClockLabel(operationalEta.eta);
}

/** Primera estimación del servicio (plan o copia en operational_eta). */
export function resolveEtaInicialDisplayLabel(servicio) {
  const plan = getOperationalPlanSnapshot(servicio);
  const op = getOperationalEtaSnapshot(servicio);
  const fromPlan =
    plan?.planned_eta_label && !isRelativeEtaLabel(plan.planned_eta_label)
      ? String(plan.planned_eta_label).trim()
      : null;
  if (fromPlan) return fromPlan;
  const iso = op?.planned_eta || plan?.planned_eta;
  return formatStableEtaClockLabel(iso);
}

function parseValidIsoEta(raw) {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function planLooksCalculating(plan) {
  if (!plan) return false;
  if (plan.status === "calculating") return true;
  if (plan.route_plan_status === "pending") return true;
  return false;
}

/**
 * Resolución única: prioridad `operational_eta`, degradación a `operational_plan` sin otro pipeline.
 * @returns {{ tier: "operational", operational: object } | { tier: "plan", plan: object, etaIso: string|null, etaLabel: string|null, remainingMins: number|null, remainingKm: number|null, updatedIso: string|null } | { tier: "calculating" } | { tier: "none" }}
 */
export function resolveEtaVisual(servicio, now = new Date()) {
  if (!servicio || servicio.estado === "anulado") return { tier: "none" };

  const operational = getOperationalEtaSnapshot(servicio);
  if (operational?.eta) return { tier: "operational", operational };

  const plan = getOperationalPlanSnapshot(servicio);
  const plannedIso = parseValidIsoEta(plan?.planned_eta);
  const plannedEtaLabel = plan?.planned_eta_label;
  const labelFromPlan =
    plannedIso != null
      ? formatOperationalEtaLabel(plannedIso, now) ||
        (plannedEtaLabel && !isRelativeEtaLabel(plannedEtaLabel) ? plannedEtaLabel : null)
      : plannedEtaLabel && !isRelativeEtaLabel(plannedEtaLabel)
        ? String(plannedEtaLabel).trim()
        : null;

  if (plannedIso || labelFromPlan) {
    const rm = Number(plan?.planned_drive_min);
    const rk = Number(plan?.planned_km);
    return {
      tier: "plan",
      plan,
      etaIso: plannedIso,
      etaLabel: labelFromPlan || (plannedIso ? formatOperationalEtaLabel(plannedIso, now) : null),
      remainingMins: Number.isFinite(rm) ? Math.max(0, Math.round(rm)) : null,
      remainingKm: Number.isFinite(rk) ? rk : null,
      updatedIso: plan?.snapshot_at || plan?.calculated_at || plan?.updated_at || null,
    };
  }

  const tripStarted = !!getOperationalTripStartedAt(servicio);
  const destOk = String(servicio?.destino || "").trim().length > 0;
  const enCurso = servicio.estado === "en_curso";

  if (enCurso && tripStarted && destOk && hasActiveRouteDestination(servicio)) {
    if (!plan || planLooksCalculating(plan)) return { tier: "calculating" };
    if (plan.route_plan_status === "failed" || plan.status === "failed") return { tier: "none" };
  }

  return { tier: "none" };
}

/**
 * Una línea (expediente, copilot): mismo orden operacional → plan → no permanente "Calculando…".
 */
export function formatOperationalEtaSnapshotLine(servicio, now = new Date()) {
  if (servicio?.estado === "anulado") return "—";
  const inicialOnly = resolveEtaInicialDisplayLabel(servicio);
  if (!hasActiveRouteDestination(servicio)) {
    return inicialOnly || "—";
  }
  const v = resolveEtaVisual(servicio, now);
  if (v.tier === "none") return inicialOnly || "—";
  if (v.tier === "calculating") return OPERATIONAL_ETA_CALCULATING;

  if (v.tier === "operational") {
    const op = v.operational;
    const etaPart = resolvePersistedEtaActualLabel(op) || "—";
    const rest = formatEmpresaOperationalRestLine(op.remaining_mins, op.remaining_km);
    const restPart = rest && rest !== "—" ? rest : null;
    const ago = formatSpanishAgo(op.updated_at || op.calculated_at, now);
    return [etaPart, restPart, ago].filter(Boolean).join(" · ");
  }

  const etaPart =
    (v.tier === "plan" && v.plan?.planned_eta_label && !isRelativeEtaLabel(v.plan.planned_eta_label)
      ? String(v.plan.planned_eta_label).trim()
      : null) ||
    formatStableEtaClockLabel(v.etaIso) ||
    v.etaLabel ||
    "—";
  const rest = formatEmpresaOperationalRestLine(v.remainingMins, v.remainingKm);
  const restPart = rest && rest !== "—" ? rest : null;
  const ago = v.updatedIso ? formatSpanishAgo(v.updatedIso, now) : null;
  return [etaPart, restPart, ago].filter(Boolean).join(" · ");
}

/**
 * ETA para UI/PDF en dos líneas (sin cambiar resolución operativa).
 * @returns {{ line1: string, line2: string|null, line3: string|null }}
 */
export function formatOperationalEtaDisplayLines(servicio, now = new Date()) {
  if (!servicio || servicio.estado === "anulado") {
    return { line1: "—", line2: null, line3: null };
  }
  const inicialOnly = resolveEtaInicialDisplayLabel(servicio);
  if (!hasActiveRouteDestination(servicio)) {
    return { line1: inicialOnly || "—", line2: null, line3: null };
  }
  const v = resolveEtaVisual(servicio, now);
  if (v.tier === "none") return { line1: inicialOnly || "—", line2: null, line3: null };
  if (v.tier === "calculating") {
    return { line1: OPERATIONAL_ETA_CALCULATING, line2: null, line3: null };
  }
  if (v.tier === "operational") {
    const op = v.operational;
    const rest = formatEmpresaOperationalRestLine(op.remaining_mins, op.remaining_km);
    const ago = formatSpanishAgo(op.updated_at || op.calculated_at, now);
    return {
      line1: resolvePersistedEtaActualLabel(op) || "—",
      line2: rest && rest !== "—" ? rest : null,
      line3: ago && ago !== "—" ? `Actualizado ${ago}` : null,
    };
  }
  const etaPart =
    (v.tier === "plan" && v.plan?.planned_eta_label && !isRelativeEtaLabel(v.plan.planned_eta_label)
      ? String(v.plan.planned_eta_label).trim()
      : null) ||
    formatStableEtaClockLabel(v.etaIso) ||
    v.etaLabel ||
    "—";
  const rest = formatEmpresaOperationalRestLine(v.remainingMins, v.remainingKm);
  const ago = v.updatedIso ? formatSpanishAgo(v.updatedIso, now) : null;
  return {
    line1: etaPart,
    line2: rest && rest !== "—" ? rest : null,
    line3: ago && ago !== "—" ? `Actualizado ${ago}` : null,
  };
}

export function getOperationalEtaUiState(servicio, now = new Date()) {
  if (!servicio || servicio.estado === "anulado") return { kind: "cancelled" };
  if (!hasActiveRouteDestination(servicio)) return { kind: "inicial_only" };
  const v = resolveEtaVisual(servicio, now);
  if (v.tier === "operational") return { kind: "ready", snapshot: v.operational };
  if (v.tier === "plan") return { kind: "plan_fallback", plan: v.plan };
  if (v.tier === "calculating") return { kind: "calculating" };
  return { kind: "idle" };
}
