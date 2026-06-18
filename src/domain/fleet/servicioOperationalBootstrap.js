import { sbFetch } from "../../data/supabaseClient.js";
import { parsePostgrestError } from "../service/serviceCreateStepTrace.js";
import { geocode, getRoute, buildPlan, fmtDur } from "../route/routePlanning.js";
import { formatOperationalEtaLabel } from "../service/etaFormatter.js";
import {
  getOperationalPlanConfirmedAt,
  getOperationalPlanSnapshot,
  mergeReferenciaOperacional,
} from "../service/serviceOperacionMeta.js";

/** Misma base que planificador empresa (sin tacógrafo vivo del conductor). */
const NORMA_EMPRESA_NEUTRAL = Object.freeze({
  cont: 0,
  todayDrive: 0,
  weekDrive: 0,
  extUsed: 0,
});

function thinRouteCoords(coords, max = 24) {
  if (!Array.isArray(coords) || coords.length <= max) return coords || [];
  if (coords.length <= 2) return coords;
  const step = Math.max(1, Math.floor((coords.length - 1) / (max - 1)));
  const out = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out.slice(0, max);
}

function safePlaceName(value, fallback) {
  const t = String(value || "").trim();
  return t || fallback;
}

/**
 * Snapshot `operational_plan` alineado con `buildOperationalPlanSnapshot` (modelo empresa neutro).
 */
export async function buildEmpresaNeutralOperationalPlanSnapshot({
  origen,
  destino,
  fechaInicio = null,
  velocidad = 80,
}) {
  const o = String(origen || "").trim();
  const d = String(destino || "").trim();
  if (!o || !d) return null;

  const vel = Math.min(100, Math.max(60, Math.round(Number(velocidad) || 80)));
  const startedAtRaw = fechaInicio ? new Date(fechaInicio) : new Date();
  const startedAt = Number.isFinite(startedAtRaw.getTime()) ? startedAtRaw : new Date();

  try {
    const from = await geocode(o);
    const to = await geocode(d);
    const route = await getRoute(from, to, vel);
    const minsConduccion = Math.max(route.mins, Math.round((route.km / vel) * 60));
    const plan = buildPlan(minsConduccion, NORMA_EMPRESA_NEUTRAL, {
      contUsed: 0,
      dayUsed: 0,
      weekUsed: 0,
      extUsed: 0,
      start: startedAt,
      km: route.km,
    });
    const eta = (plan.arrival instanceof Date ? plan.arrival : new Date(plan.arrival)).toISOString();
    const rests = (plan.segs || []).filter((seg) => seg.type !== "conduccion");
    const breaks = rests.filter((seg) => String(seg.type).startsWith("pausa"));
    const dailyRest = rests.find((seg) => seg.type === "descanso");
    const weeklyRest = rests.find((seg) => seg.type === "descanso_semana");
    const routeFrom = safePlaceName(from.name, o);
    const routeTo = safePlaceName(to.name, d);

    return {
      status: "ok",
      route_plan_status: "ready",
      snapshot_at: new Date().toISOString(),
      input_origin: o,
      input_destination: d,
      input_waypoint: null,
      planned_origin: routeFrom,
      planned_destination: routeTo,
      planned_waypoint: null,
      planned_km: Math.round(route.km * 10) / 10,
      planned_drive_min: Math.round(minsConduccion),
      planned_drive_time: fmtDur(Math.round(minsConduccion)),
      planned_eta: eta,
      planned_eta_label: formatOperationalEtaLabel(eta, startedAt),
      planned_breaks: breaks.length,
      planned_daily_rest: !!dailyRest,
      planned_daily_rest_label: dailyRest
        ? "Descanso diario previsto"
        : weeklyRest
          ? "Descanso semanal previsto"
          : "Sin descanso diario previsto",
      planned_rest_plan: rests.map((seg) => ({
        type: seg.type,
        start: seg.start instanceof Date ? seg.start.toISOString() : new Date(seg.start).toISOString(),
        dur: seg.dur,
      })),
      planned_summary: `${Math.round(route.km)} km · ${fmtDur(Math.round(minsConduccion))} conducción · ${breaks.length} pausa${breaks.length === 1 ? "" : "s"} · ${dailyRest ? "descanso diario" : "sin descanso diario"}`,
      planned_route: {
        legs: [{ from: routeFrom, to: routeTo, km: route.km, mins: route.mins, real: !!route.real }],
        coords: thinRouteCoords(route.coords),
      },
      confidence: route.real ? "high" : "medium",
      velocidad: vel,
      empresa_assign_bootstrap_at: new Date().toISOString(),
    };
  } catch {
    return {
      status: "failed",
      route_plan_status: "failed",
      snapshot_at: new Date().toISOString(),
      input_origin: o,
      input_destination: d,
      planned_origin: o,
      planned_destination: d,
      planned_summary: "No se pudo calcular ruta en asignación",
      confidence: "low",
      velocidad: vel,
      empresa_assign_bootstrap_at: new Date().toISOString(),
    };
  }
}

function planReadyForFlota(plan) {
  return (
    plan?.status === "ok" &&
    plan?.route_plan_status === "ready" &&
    !!plan?.planned_eta
  );
}

/**
 * Bootstrap operacional: meta en `referencia` (__SRV_OP__).
 * Solo invocado desde assignConductorPrincipalToServicio (persist: true).
 */
export async function bootstrapOperationalFlowOnConductorAssign({
  servicio,
  conductorId,
  conductorNombre = null,
  origen = null,
  destino = null,
  fechaInicio = null,
  persist = true,
  dispatchRecarga = false,
}) {
  if (!servicio?.id || !conductorId) {
    throw new Error("Bootstrap operacional: servicio o conductor no válido");
  }

  const assignedAt = new Date().toISOString();
  const metaPatch = {
    conductor_assigned_at: assignedAt,
    conductor_assigned_id: conductorId,
    conductor_assigned_label: conductorNombre ? String(conductorNombre).trim() : null,
  };

  // No fijar inicio operacional en asignación: el viaje aún no arrancó (usa servicios.fecha_inicio).
  // operational_trip_started_at se persiste al iniciar la conducción operacional (PR-30).

  const existingPlan = getOperationalPlanSnapshot(servicio);
  if (!planReadyForFlota(existingPlan)) {
    const plan = await buildEmpresaNeutralOperationalPlanSnapshot({
      origen: origen || servicio.origen,
      destino: destino || servicio.destino,
      fechaInicio: fechaInicio || servicio.fecha_inicio,
      velocidad: existingPlan?.velocidad || 80,
    });
    if (plan) metaPatch.operational_plan = plan;
    if (!getOperationalPlanConfirmedAt(servicio) && planReadyForFlota(plan)) {
      metaPatch.operational_plan_confirmed_at = assignedAt;
    }
  }

  const referencia = mergeReferenciaOperacional(servicio.referencia || null, metaPatch);
  if (!referencia || !String(referencia).includes("__SRV_OP__")) {
    throw new Error("Bootstrap operacional: referencia inválida tras merge");
  }

  if (!persist) {
    return referencia;
  }

  const res = await sbFetch(`/rest/v1/servicios?id=eq.${servicio.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ referencia }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const parsed = parsePostgrestError(t);
    const err = new Error(
      parsed.code === "42501"
        ? `RLS 42501 en "${parsed.table || "servicios"}" [PATCH servicios.bootstrap]: ${parsed.message || t}`
        : t || `No se pudo persistir referencia operativa (${res.status})`,
    );
    err.stepId = "PATCH servicios.bootstrap";
    err.pgTable = parsed.table || "servicios";
    err.pgCode = parsed.code || "";
    throw err;
  }

  const rows = await res.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : rows;
  const outRef = row?.referencia ?? referencia;
  if (!outRef || !String(outRef).includes("__SRV_OP__")) {
    throw new Error("Bootstrap operacional: servidor devolvió referencia vacía o sin meta");
  }

  if (dispatchRecarga) {
    try {
      window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));
    } catch {
      /* SSR */
    }
  }

  return outRef;
}
