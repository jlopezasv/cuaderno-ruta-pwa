/**
 * Motor de desviación operacional en vivo (Fase 2 V1).
 * Solo cálculo en cliente: no persiste ni llama a routing.
 */

import { formatOperationalEtaLabel } from "./etaFormatter.js";
import { getOperationalPlanSnapshot, getOperationalTripStartedAt } from "./serviceOperacionMeta.js";
import { OPERATIONAL_ETA_CALCULATING, resolveEtaVisual } from "./operationalEtaPresentation.js";

/** @typedef {"rest_break"|"dock_loading"|"dock_unloading"|"traffic_delay"|"urban_delay"|"unexplained_stop"|"route_deviation"|"nominal"|"unknown"} OperationalSituation */

/** @type {OperationalSituation[]} */
export const OPERATIONAL_SITUATION_CODES = [
  "rest_break",
  "dock_loading",
  "dock_unloading",
  "traffic_delay",
  "urban_delay",
  "unexplained_stop",
  "route_deviation",
  "nominal",
  "unknown",
];

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function isDescansoCr(crType) {
  const t = String(crType || "");
  return t === "inicio_descanso" || t === "inicio_descanso_frac" || t.includes("descanso");
}

/** Alineado con la heurística de capa visual previa (`computeOperationalEtaAdjustment`). */
function isEsperaCargaDescargaOStopActivo(activeStop) {
  if (!activeStop || typeof activeStop !== "object") return false;
  if (activeStop.estado === "llegado" || activeStop.hora_llegada_real) return true;
  const tipo = String(activeStop.tipo || "").toLowerCase();
  return /carga|descarga|carga_descarga|muelle/.test(tipo);
}

/** @returns {"load"|"unload"|null} */
function dockKind(activeStop) {
  if (!isEsperaCargaDescargaOStopActivo(activeStop)) return null;
  const tipo = String(activeStop.tipo || "").toLowerCase();
  if (/solo_descarga/.test(tipo)) return "unload";
  if (/\bdescarga\b/.test(tipo) && !/\bcarga\b/.test(tipo)) return "unload";
  if (/\bcarga\b/.test(tipo) && /\bdescarga\b/.test(tipo)) return "unload";
  return "load";
}

function resolvePlannedRemaining({ operationalEta, plan, tripStartedAtIso, nowMs }) {
  let prk = numOrNull(operationalEta?.planned_remaining_km);
  let prm = numOrNull(operationalEta?.planned_remaining_mins);

  const pdm = numOrNull(plan?.planned_drive_min);
  const pk = numOrNull(plan?.planned_km);
  const t0 = tripStartedAtIso ? new Date(tripStartedAtIso).getTime() : NaN;

  if ((prk == null || prm == null) && Number.isFinite(t0) && Number.isFinite(pdm) && pdm > 0 && Number.isFinite(nowMs)) {
    const elapsedMin = Math.max(0, (nowMs - t0) / 60000);
    const derivedPrm = Math.max(0, pdm - elapsedMin);
    if (prm == null) prm = derivedPrm;
    if (prk == null && pk != null && pk > 0) {
      prk = pk * (derivedPrm / pdm);
    }
  }

  return { planned_remaining_km: prk, planned_remaining_mins: prm, elapsedMinsFromPlan: computeElapsedMins(t0, nowMs) };
}

function computeElapsedMins(t0, nowMs) {
  if (!Number.isFinite(t0) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, (nowMs - t0) / 60000);
}

/**
 * MÓDULO 1 — Progreso esperado vs real (sin routing).
 *
 * @param {object} p
 * @param {object|null} [p.operationalEta]
 * @param {object|null} [p.operationalPlan]
 * @param {string|null} [p.tripStartedAtIso]
 * @param {number} p.nowMs
 */
export function computeOperationalProgress({
  operationalEta = null,
  operationalPlan = null,
  tripStartedAtIso = null,
  nowMs,
}) {
  const plan = operationalPlan && typeof operationalPlan === "object" ? operationalPlan : null;
  const eta = operationalEta && typeof operationalEta === "object" ? operationalEta : null;
  const { planned_remaining_km, planned_remaining_mins, elapsedMinsFromPlan } = resolvePlannedRemaining({
    operationalEta: eta,
    plan,
    tripStartedAtIso,
    nowMs,
  });

  const remaining_km = numOrNull(eta?.remaining_km);
  const remaining_mins = numOrNull(eta?.remaining_mins);
  const totalKm = numOrNull(plan?.planned_km);
  const totalMin = numOrNull(plan?.planned_drive_min);

  const deltaKm =
    remaining_km != null && planned_remaining_km != null ? Math.round((remaining_km - planned_remaining_km) * 10) / 10 : null;

  let expectedProgressPct = null;
  let realProgressPct = null;
  if (totalMin != null && totalMin > 0 && elapsedMinsFromPlan != null) {
    expectedProgressPct = clamp((100 * elapsedMinsFromPlan) / totalMin, 0, 100);
    expectedProgressPct = Math.round(expectedProgressPct * 10) / 10;
  }
  if (totalKm != null && totalKm > 0 && remaining_km != null) {
    realProgressPct = clamp(100 * (1 - remaining_km / totalKm), 0, 100);
    realProgressPct = Math.round(realProgressPct * 10) / 10;
  }

  const progressDeltaPct =
    expectedProgressPct != null && realProgressPct != null
      ? Math.round((realProgressPct - expectedProgressPct) * 10) / 10
      : null;

  return {
    planned_remaining_km,
    planned_remaining_mins,
    remaining_km,
    remaining_mins,
    elapsedMinsFromPlan,
    expectedProgressPct,
    realProgressPct,
    deltaKm,
    progressDeltaPct,
  };
}

function speedKmhFromLocation(latestLocation) {
  const speedRaw = numOrNull(latestLocation?.velocidad);
  if (speedRaw == null) return null;
  return speedRaw > 55 ? speedRaw : speedRaw * 3.6;
}

/**
 * Tiempo sin avance relevante en km (UI) o detención inferida.
 */
function estimateStalledMs({ tacografoEstado, activeStop, latestLocation, nowMs, progressMemory }) {
  const kmStableMs = progressMemory?.kmStableMs;
  if (isEsperaCargaDescargaOStopActivo(activeStop) && activeStop?.hora_llegada_real) {
    const arr = new Date(activeStop.hora_llegada_real).getTime();
    if (Number.isFinite(arr)) return Math.max(0, nowMs - arr);
  }
  const tacKnown = tacografoEstado && typeof tacografoEstado.isDriving === "boolean";
  if (tacKnown && !tacografoEstado.isDriving) {
    const crDurMin = numOrNull(tacografoEstado.crDur);
    if (Number.isFinite(crDurMin) && crDurMin > 0) return crDurMin * 60000;
  }
  const sk = speedKmhFromLocation(latestLocation);
  const locTs = latestLocation?.ts || latestLocation?.updatedAt;
  const locMs = locTs ? new Date(locTs).getTime() : NaN;
  if (Number.isFinite(locMs) && sk != null && sk < 3 && nowMs - locMs < 25 * 60000) {
    return Math.min(45 * 60000, Math.max(0, nowMs - locMs));
  }
  if (kmStableMs != null && Number.isFinite(kmStableMs)) return kmStableMs;
  return 0;
}

/**
 * MÓDULO 2 — Clasificación heurística de contexto operativo.
 *
 * @param {object} p
 * @param {ReturnType<typeof computeOperationalProgress>} [p.progress]
 */
export function classifyOperationalSituation({
  tacografoEstado = null,
  activeStop = null,
  latestLocation = null,
  progress = null,
  progressMemory = null,
  nowMs,
}) {
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return /** @type {OperationalSituation} */ ("unknown");

  const crType = tacografoEstado?.crType != null ? String(tacografoEstado.crType) : "";
  if (isDescansoCr(crType)) return "rest_break";

  const dk = dockKind(activeStop);
  if (dk === "unload") return "dock_unloading";
  if (dk === "load") return "dock_loading";

  const tacKnown = tacografoEstado && typeof tacografoEstado.isDriving === "boolean";
  const isDriving = tacKnown ? !!tacografoEstado.isDriving : null;

  const locTs = latestLocation?.ts || latestLocation?.updatedAt;
  const locAgeMin = locTs ? Math.max(0, Math.round((now - new Date(locTs).getTime()) / 60000)) : null;
  const speedKmh = speedKmhFromLocation(latestLocation);

  const stalledMs = estimateStalledMs({
    tacografoEstado,
    activeStop,
    latestLocation,
    nowMs: now,
    progressMemory,
  });
  const stalledMin = stalledMs / 60000;

  const deltaKm = progress?.deltaKm;
  const progressDeltaPct = progress?.progressDeltaPct;

  const routeBehind =
    (deltaKm != null && deltaKm > 12) ||
    (progressDeltaPct != null && progressDeltaPct < -12 && (isDriving !== false));

  if (routeBehind && isDriving !== false) return "route_deviation";

  if (isDriving === true && speedKmh != null && locAgeMin != null && locAgeMin <= 30) {
    if (speedKmh < 12 && speedKmh >= 3) return "urban_delay";
    if (speedKmh < 28 && speedKmh >= 12 && (progressDeltaPct == null || progressDeltaPct < -5)) {
      return "traffic_delay";
    }
    if (speedKmh < 8 && locAgeMin >= 8 && (progressDeltaPct == null || progressDeltaPct < -3)) {
      return "traffic_delay";
    }
  }

  if (stalledMin >= 18 && isDriving !== true && !isDescansoCr(crType)) {
    const inPausa = crType === "inicio_pausa";
    const crDur = numOrNull(tacografoEstado?.crDur);
    const pausaCorta = inPausa && crDur != null && crDur < 45;
    if (!pausaCorta) return "unexplained_stop";
  }

  if (progressMemory?.kmStableMs != null && progressMemory.kmStableMs >= 35 * 60000 && isDriving === true) {
    if ((progressDeltaPct != null && progressDeltaPct < -8) || (deltaKm != null && deltaKm > 5)) {
      return "unexplained_stop";
    }
  }

  return "nominal";
}

function situationLabel(code) {
  switch (code) {
    case "rest_break":
      return "Descanso legal";
    case "dock_loading":
      return "Carga en muelle";
    case "dock_unloading":
      return "Descarga en muelle";
    case "traffic_delay":
      return "Tráfico lento";
    case "urban_delay":
      return "Circulación urbana lenta";
    case "unexplained_stop":
      return "Parada anómala";
    case "route_deviation":
      return "Desvío de ruta / retraso de avance";
    case "nominal":
      return "En ritmo";
    default:
      return "Sin clasificar";
  }
}

/**
 * MÓDULO 3 — Retraso visual y confianza (V1).
 *
 * @returns {{ delayMins: number, reason: string|null, confidence: "high"|"medium"|"low", situation: OperationalSituation }}
 */
export function computeOperationalDelay({
  servicio = null,
  operationalEta = null,
  operationalPlan = null,
  tripStartedAtIso = null,
  latestLocation = null,
  tacografoEstado = null,
  activeStop = null,
  nowMs,
  progressMemory = null,
  progress: progressIn = null,
  situation: situationIn = null,
}) {
  const now = Number(nowMs);
  if (!Number.isFinite(now)) {
    return { delayMins: 0, reason: null, confidence: "high", situation: "unknown" };
  }

  const op = operationalEta && typeof operationalEta === "object" ? operationalEta : null;
  if (!op?.eta || servicio?.estado === "anulado") {
    return { delayMins: 0, reason: null, confidence: "high", situation: "unknown" };
  }
  if (servicio?.estado && servicio.estado !== "en_curso") {
    return { delayMins: 0, reason: null, confidence: "high", situation: "nominal" };
  }

  const plan = operationalPlan && typeof operationalPlan === "object" ? operationalPlan : null;
  const tripIso = tripStartedAtIso ?? null;

  const progress =
    progressIn ||
    computeOperationalProgress({
      operationalEta: op,
      operationalPlan: plan,
      tripStartedAtIso: tripIso,
      nowMs: now,
    });

  const situation =
    situationIn ||
    classifyOperationalSituation({
      tacografoEstado,
      activeStop,
      latestLocation,
      progress,
      progressMemory,
      nowMs: now,
    });

  if (situation === "rest_break") {
    return {
      delayMins: 0,
      reason: "Descanso legal — no penaliza ETA contractual",
      confidence: "high",
      situation,
    };
  }

  if (situation === "dock_loading") {
    return {
      delayMins: 14,
      reason: "Retraso operativo controlado · carga en muelle",
      confidence: "medium",
      situation,
    };
  }
  if (situation === "dock_unloading") {
    return {
      delayMins: 12,
      reason: "Retraso operativo controlado · descarga en muelle",
      confidence: "medium",
      situation,
    };
  }

  const etaUpd = op.updated_at || op.calculated_at || op.location_ts;
  const etaAgeMin = etaUpd ? Math.max(0, Math.round((now - new Date(etaUpd).getTime()) / 60000)) : 999;

  const locTs = latestLocation?.ts || latestLocation?.updatedAt;
  const locAgeMin = locTs ? Math.max(0, Math.round((now - new Date(locTs).getTime()) / 60000)) : null;

  const speedKmh = speedKmhFromLocation(latestLocation);
  const muyLento = speedKmh != null && speedKmh < 8 && locAgeMin != null && locAgeMin >= 10;

  const kmStableMs = progressMemory?.kmStableMs;
  const kmPlano =
    kmStableMs != null &&
    Number.isFinite(kmStableMs) &&
    kmStableMs >= 20 * 60000 &&
    etaAgeMin >= 15;

  const noProgresoMin = Math.max(
    etaAgeMin,
    locAgeMin ?? 0,
    kmStableMs != null && Number.isFinite(kmStableMs) ? Math.round(kmStableMs / 60000) : 0,
  );

  let delayMins = 0;
  const reasons = [];

  if (situation === "traffic_delay") {
    delayMins = 18;
    reasons.push("Tráfico lento (penalización suave)");
  } else if (situation === "urban_delay") {
    delayMins = 15;
    reasons.push("Circulación urbana lenta (penalización suave)");
  } else if (situation === "unexplained_stop") {
    delayMins = 42;
    reasons.push("Parada anómala sin contexto operativo (penalización fuerte)");
  } else if (situation === "route_deviation") {
    delayMins = 28;
    reasons.push("Avance por debajo del plan o desvío probable");
  } else {
    const crType = tacografoEstado?.crType != null ? String(tacografoEstado.crType) : "";
    const inPausa = crType === "inicio_pausa";
    const crDur = numOrNull(tacografoEstado?.crDur);
    const pausaCorta = inPausa && crDur != null && crDur < 45;
    const dockWait = isEsperaCargaDescargaOStopActivo(activeStop);

    if (isDescansoCr(crType) || pausaCorta || dockWait) {
      return { delayMins: 0, reason: null, confidence: "high", situation: situation === "nominal" ? "nominal" : situation };
    }

    const tacKnown = tacografoEstado && typeof tacografoEstado.isDriving === "boolean";
    if (tacKnown && !tacografoEstado.isDriving) {
      return { delayMins: 0, reason: null, confidence: "high", situation: "nominal" };
    }

    const strong =
      noProgresoMin >= 45 || etaAgeMin >= 45 || (locAgeMin != null && locAgeMin >= 45);
    const soft =
      !strong &&
      (noProgresoMin >= 20 ||
        etaAgeMin >= 20 ||
        (locAgeMin != null && locAgeMin >= 20) ||
        muyLento ||
        kmPlano);

    if (strong) {
      delayMins = 32;
      if (etaAgeMin >= 45) reasons.push("Sin actualización operativa prolongada");
      if (locAgeMin != null && locAgeMin >= 45) reasons.push("Ubicación sin refresco prolongado");
      if (kmStableMs != null && kmStableMs >= 45 * 60000) {
        reasons.push("Distancia restante sin mejorar (prolongado)");
      }
      if (!reasons.length) reasons.push("Sin avance real hacia destino (prolongado)");
    } else if (soft) {
      delayMins = 16;
      if (muyLento) reasons.push("Avance muy lento");
      else if (kmPlano) reasons.push("Distancia restante sin mejorar");
      else if (locAgeMin != null && locAgeMin >= 20) reasons.push("Ritmo por debajo de lo previsto (ubicación)");
      else reasons.push("Ritmo por debajo de lo previsto (datos)");
    }
  }

  delayMins = Math.min(55, Math.round(delayMins));

  let confidence = "high";
  if (delayMins > 0) {
    if (
      situation === "traffic_delay" ||
      situation === "urban_delay" ||
      situation === "dock_loading" ||
      situation === "dock_unloading"
    ) {
      confidence = "medium";
    } else {
      confidence = "low";
    }
  }

  return {
    delayMins,
    reason: reasons.length ? reasons.join(" · ") : null,
    confidence,
    situation,
  };
}

/**
 * MÓDULO 4 — Paquete de presentación ETA viva (no persiste).
 *
 * @param {object} p
 * @param {object|null} [p.servicio]
 * @param {Date|number} [p.now]
 * @param {object|null} [p.latestLocation]
 * @param {object|null} [p.tacografoEstado]
 * @param {object|null} [p.activeStop]
 * @param {object|null} [p.progressMemory]
 * @param {ReturnType<typeof resolveEtaVisual>|null} [p.resolvedVisual] — evita doble `resolveEtaVisual` en UI
 */
export function buildOperationalEtaVisual({
  servicio,
  now = new Date(),
  latestLocation = null,
  tacografoEstado = null,
  activeStop = null,
  progressMemory = null,
  resolvedVisual = null,
}) {
  const nowRef = now instanceof Date ? now : new Date(now);
  const nowMs = nowRef.getTime();

  const v = resolvedVisual || resolveEtaVisual(servicio, nowRef);
  const plan = getOperationalPlanSnapshot(servicio);
  const tripStartedAtIso = getOperationalTripStartedAt(servicio);

  const base = {
    tier: v.tier,
    calculatingLabel: v.tier === "calculating" ? OPERATIONAL_ETA_CALCULATING : null,
    progress: null,
    delay: { delayMins: 0, reason: null, confidence: "high", situation: "unknown" },
    contractualEtaIso: null,
    contractualEtaLabel: null,
    operationalEtaIso: null,
    operationalEtaLabel: null,
    operationalEtaLiveIso: null,
    operationalEtaLiveLabel: null,
    remainingMinsVisual: null,
    remainingKmVisual: null,
    situationLabel: null,
  };

  if (v.tier === "none" || v.tier === "calculating") {
    return base;
  }

  const contractualIso = parseValidIso(v.tier === "operational" ? v.operational?.planned_eta : v.plan?.planned_eta);
  base.contractualEtaIso = contractualIso;
  base.contractualEtaLabel = contractualIso ? formatOperationalEtaLabel(contractualIso, nowRef) : null;

  if (v.tier === "plan") {
    base.operationalEtaIso = v.etaIso;
    base.operationalEtaLabel = v.etaLabel || (v.etaIso ? formatOperationalEtaLabel(v.etaIso, nowRef) : null);
    base.operationalEtaLiveIso = v.etaIso;
    base.operationalEtaLiveLabel = base.operationalEtaLabel;
    base.remainingMinsVisual = v.remainingMins;
    base.remainingKmVisual = v.remainingKm;
    return base;
  }

  if (v.tier !== "operational") return base;

  const op = v.operational;
  const progress = computeOperationalProgress({
    operationalEta: op,
    operationalPlan: plan,
    tripStartedAtIso,
    nowMs,
  });
  base.progress = progress;

  const delay = computeOperationalDelay({
    servicio,
    operationalEta: op,
    operationalPlan: plan,
    tripStartedAtIso,
    latestLocation,
    tacografoEstado,
    activeStop,
    nowMs,
    progressMemory,
    progress,
  });
  base.delay = delay;
  base.situationLabel = situationLabel(delay.situation);

  base.operationalEtaIso = op.eta;
  base.operationalEtaLabel =
    formatOperationalEtaLabel(op.eta, nowRef) ||
    (typeof op.label === "string" && op.label.trim() ? op.label : null);

  const d = delay.delayMins;
  const etaBase = op.eta;
  const etaVisMs =
    d > 0 && etaBase
      ? new Date(etaBase).getTime() + d * 60000
      : etaBase
        ? new Date(etaBase).getTime()
        : NaN;
  const etaVisIso = Number.isFinite(etaVisMs) ? new Date(etaVisMs).toISOString() : etaBase;
  base.operationalEtaLiveIso = etaVisIso;
  base.operationalEtaLiveLabel =
    formatOperationalEtaLabel(etaVisIso, nowRef) || base.operationalEtaLabel;

  const rm0 = numOrNull(op.remaining_mins);
  base.remainingMinsVisual =
    d > 0 && rm0 != null ? Math.max(0, Math.round(rm0 + d)) : op.remaining_mins ?? null;
  base.remainingKmVisual = op.remaining_km ?? null;

  return base;
}

function parseValidIso(raw) {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}
