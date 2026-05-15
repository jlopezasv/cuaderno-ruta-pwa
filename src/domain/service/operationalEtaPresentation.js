import {
  getOperationalEtaSnapshot,
  getOperationalPlanSnapshot,
  getOperationalTripStartedAt,
} from "./serviceOperacionMeta.js";
import {
  formatEmpresaOperationalRestLine,
  formatOperationalEtaLabel,
  formatSpanishAgo,
  isRelativeEtaLabel,
} from "./etaFormatter.js";

/** Transitorio: aún no hay ETA persistida ni dato de plan utilizable. */
export const OPERATIONAL_ETA_CALCULATING = "Calculando ETA…";

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

  if (enCurso && tripStarted && destOk) {
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
  const v = resolveEtaVisual(servicio, now);
  if (v.tier === "none") return "—";
  if (v.tier === "calculating") return OPERATIONAL_ETA_CALCULATING;

  if (v.tier === "operational") {
    const op = v.operational;
    const etaPart =
      formatOperationalEtaLabel(op.eta, now) || (!isRelativeEtaLabel(op.label) ? op.label : null) || "—";
    const rest = formatEmpresaOperationalRestLine(op.remaining_mins, op.remaining_km);
    const restPart = rest && rest !== "—" ? rest : null;
    const ago = formatSpanishAgo(op.updated_at || op.calculated_at, now);
    return [etaPart, restPart, ago].filter(Boolean).join(" · ");
  }

  const etaPart = v.etaLabel || (v.etaIso ? formatOperationalEtaLabel(v.etaIso, now) : null) || "—";
  const rest = formatEmpresaOperationalRestLine(v.remainingMins, v.remainingKm);
  const restPart = rest && rest !== "—" ? rest : null;
  const ago = v.updatedIso ? formatSpanishAgo(v.updatedIso, now) : null;
  return [etaPart, restPart, ago].filter(Boolean).join(" · ");
}

export function getOperationalEtaUiState(servicio, now = new Date()) {
  if (!servicio || servicio.estado === "anulado") return { kind: "cancelled" };
  const v = resolveEtaVisual(servicio, now);
  if (v.tier === "operational") return { kind: "ready", snapshot: v.operational };
  if (v.tier === "plan") return { kind: "plan_fallback", plan: v.plan };
  if (v.tier === "calculating") return { kind: "calculating" };
  return { kind: "idle" };
}
