import { useEffect, useMemo, useRef, memo } from "react";
import {
  formatOperationalEtaLabel,
  formatEmpresaOperationalRestLine,
  formatSpanishAgo,
  isRelativeEtaLabel,
} from "../../../domain/service/etaFormatter.js";
import { OPERATIONAL_ETA_CALCULATING, resolveEtaVisual } from "../../../domain/service/operationalEtaPresentation.js";
import { buildOperationalEtaVisual } from "../../../domain/service/operationalDeviationEngine.js";

/**
 * ETA: prioridad `operational_eta`; si aún no existe, degradación limpia al plan;
 * "Calculando ETA…" solo en transitorio (viaje en curso y plan pendiente / sin datos).
 *
 * Capa visual viva (motor de desviación operacional) — no persiste.
 *
 * @param {"default"|"empresa"} [layout] — `empresa`: compromiso vs operacional explícito (flota)
 */
function OperationalEtaSnapshotBlockImpl({
  servicio,
  nowMs,
  tx,
  su,
  subtle,
  latestLocation = null,
  tacografoEstado = null,
  activeStop = null,
  layout = "default",
}) {
  const txU = tx ?? "#0f172a";
  const suU = su ?? "#64748B";
  const sub = subtle ?? "#475569";
  const isEmpresa = layout === "empresa";
  const clockMs = nowMs != null ? Number(nowMs) : Date.now();
  const nowRef = useMemo(() => new Date(clockMs), [clockMs]);
  const nowEpoch = clockMs;
  const v = resolveEtaVisual(servicio, nowRef);

  const kmProgressRef = useRef({ lastKm: null, stableSinceMs: null });
  useEffect(() => {
    kmProgressRef.current = { lastKm: null, stableSinceMs: null };
  }, [servicio?.id]);

  const opRemainingKm = v.tier === "operational" ? v.operational?.remaining_km : null;
  const opUpdatedAt = v.tier === "operational" ? v.operational?.updated_at || v.operational?.calculated_at : null;

  const kmStableMs = useMemo(() => {
    if (v.tier !== "operational") return null;
    const rk = Number(opRemainingKm);
    if (!Number.isFinite(rk)) return null;
    const prev = kmProgressRef.current;
    if (prev.lastKm == null || rk < prev.lastKm - 0.35) {
      kmProgressRef.current = { lastKm: rk, stableSinceMs: nowEpoch };
      return 0;
    }
    const since = prev.stableSinceMs ?? nowEpoch;
    kmProgressRef.current = { lastKm: prev.lastKm, stableSinceMs: since };
    return Math.max(0, nowEpoch - since);
  }, [v.tier, opRemainingKm, opUpdatedAt, nowEpoch, servicio?.id]);

  const liveVisual = useMemo(() => {
    const now = new Date(clockMs);
    const vr = resolveEtaVisual(servicio, now);
    if (vr.tier !== "operational") return null;
    return buildOperationalEtaVisual({
      servicio,
      now,
      latestLocation,
      tacografoEstado,
      activeStop,
      progressMemory: kmStableMs == null ? null : { kmStableMs },
      resolvedVisual: vr,
    });
  }, [servicio, clockMs, latestLocation, tacografoEstado, activeStop, kmStableMs]);

  if (!servicio || servicio.estado === "anulado" || v.tier === "none") {
    return (
      <>
        <span
          style={{
            fontSize: 16,
            fontWeight: 750,
            color: "#94A3B8",
            lineHeight: 1.15,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: -0.2,
          }}
        >
          —
        </span>
        <span style={{ fontSize: 10, color: suU, fontWeight: 500 }}>Llegada estimada</span>
      </>
    );
  }

  if (v.tier === "calculating") {
    return (
      <>
        <span style={{ fontSize: 14, fontWeight: 650, color: txU, lineHeight: 1.2 }}>
          {OPERATIONAL_ETA_CALCULATING}
        </span>
        <span style={{ fontSize: 10, color: suU, fontWeight: 500 }}>Llegada estimada</span>
      </>
    );
  }

  if (v.tier === "plan") {
    const head =
      v.etaLabel ||
      (v.etaIso ? formatOperationalEtaLabel(v.etaIso, nowRef) : null) ||
      (v.plan?.planned_eta_label && !isRelativeEtaLabel(v.plan.planned_eta_label)
        ? String(v.plan.planned_eta_label)
        : null) ||
      "—";
    const rest = formatEmpresaOperationalRestLine(v.remainingMins, v.remainingKm);
    const ago = v.updatedIso ? formatSpanishAgo(v.updatedIso, nowRef) : "—";
    if (isEmpresa) {
      return (
        <>
          <span
            style={{
              fontSize: 10,
              color: suU,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.35,
            }}
          >
            ETA comprometida (plan)
          </span>
          <span
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: txU,
              lineHeight: 1.2,
              fontVariantNumeric: "tabular-nums",
              marginTop: 2,
            }}
          >
            {head}
          </span>
          <span style={{ fontSize: 10, color: suU, fontWeight: 700, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.35 }}>
            ETA operacional actual
          </span>
          <span style={{ fontSize: 13, fontWeight: 650, color: sub, marginTop: 2 }}>
            Pendiente (conductor sin ETA operacional persistida)
          </span>
          <span style={{ fontSize: 10, color: suU, fontWeight: 700, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.35 }}>
            Restan (plan)
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: sub, lineHeight: 1.25 }}>{rest}</span>
          <span style={{ fontSize: 10, color: suU, fontWeight: 700, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.35 }}>Plan</span>
          <span style={{ fontSize: 11, color: sub, fontWeight: 600 }}>{ago}</span>
        </>
      );
    }
    return (
      <>
        <span
          style={{
            fontSize: 9,
            color: suU,
            fontWeight: 650,
            letterSpacing: 0.06,
            textTransform: "uppercase",
            opacity: 0.92,
          }}
        >
          Previa · planificación
        </span>
        <span
          style={{
            fontSize: 10,
            color: suU,
            fontWeight: 700,
            marginTop: 6,
            textTransform: "uppercase",
            letterSpacing: 0.35,
          }}
        >
          ETA prevista
        </span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 750,
            color: txU,
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {head}
        </span>
        <span
          style={{
            fontSize: 10,
            color: suU,
            fontWeight: 700,
            marginTop: 4,
            textTransform: "uppercase",
            letterSpacing: 0.35,
          }}
        >
          Según plan
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 650, color: sub, lineHeight: 1.25 }}>{rest}</span>
        <span
          style={{
            fontSize: 10,
            color: suU,
            fontWeight: 700,
            marginTop: 3,
            textTransform: "uppercase",
            letterSpacing: 0.35,
          }}
        >
          Plan
        </span>
        <span style={{ fontSize: 11, color: sub, fontWeight: 600 }}>{ago}</span>
      </>
    );
  }

  const opEta = v.operational;
  const delay = liveVisual?.delay;
  const d = delay?.delayMins ?? 0;
  const headVis =
    liveVisual?.operationalEtaLiveLabel ||
    formatOperationalEtaLabel(opEta.eta, nowRef) ||
    (!isRelativeEtaLabel(opEta.label) ? opEta.label : null) ||
    "—";
  const visRemainingMins = liveVisual?.remainingMinsVisual ?? opEta.remaining_mins;
  const contractualLabel = liveVisual?.contractualEtaLabel;
  const contractualIso = liveVisual?.contractualEtaIso;
  const opIso = opEta.eta ? new Date(opEta.eta).toISOString() : null;
  const showContractual =
    contractualLabel &&
    contractualIso &&
    opIso &&
    contractualIso !== opIso &&
    delay?.situation !== "rest_break";

  const contractualHead =
    contractualLabel ||
    (contractualIso ? formatOperationalEtaLabel(contractualIso, nowRef) : null) ||
    formatOperationalEtaLabel(opEta.eta, nowRef) ||
    (!isRelativeEtaLabel(opEta.label) ? opEta.label : null) ||
    "—";

  if (isEmpresa) {
    const motivo =
      d > 0 && delay?.reason
        ? delay.reason
        : d > 0 && liveVisual?.situationLabel && delay?.situation && delay.situation !== "nominal"
          ? liveVisual.situationLabel
          : delay?.situation === "rest_break" && delay.reason
            ? delay.reason
            : null;
    return (
      <>
        <span
          style={{
            fontSize: 10,
            color: suU,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.35,
          }}
        >
          ETA comprometida
        </span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: txU,
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
            marginTop: 2,
          }}
        >
          {contractualHead}
        </span>
        <span
          style={{
            fontSize: 10,
            color: suU,
            fontWeight: 700,
            marginTop: 10,
            textTransform: "uppercase",
            letterSpacing: 0.35,
          }}
        >
          ETA operacional actual
        </span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: "#1d4ed8",
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
            marginTop: 2,
          }}
        >
          {headVis}
        </span>
        {d > 0 ? (
          <span style={{ fontSize: 12, color: "#b45309", fontWeight: 750, marginTop: 6, lineHeight: 1.35 }}>
            +{d}m retraso operativo
          </span>
        ) : null}
        {motivo ? (
          <span style={{ fontSize: 11, color: "#92400e", fontWeight: 650, marginTop: 4, lineHeight: 1.4 }}>
            Motivo: {motivo}
          </span>
        ) : null}
        <span
          style={{
            fontSize: 10,
            color: suU,
            fontWeight: 700,
            marginTop: 10,
            textTransform: "uppercase",
            letterSpacing: 0.35,
          }}
        >
          Restan
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 650, color: sub, lineHeight: 1.25 }}>
          {formatEmpresaOperationalRestLine(visRemainingMins, opEta.remaining_km)}
        </span>
        <span
          style={{
            fontSize: 10,
            color: suU,
            fontWeight: 700,
            marginTop: 6,
            textTransform: "uppercase",
            letterSpacing: 0.35,
          }}
        >
          Actualizado
        </span>
        <span style={{ fontSize: 11, color: sub, fontWeight: 600 }}>
          {formatSpanishAgo(opEta.updated_at || opEta.calculated_at, nowRef)}
        </span>
        {delay?.confidence === "low" && d > 0 ? (
          <span style={{ fontSize: 10, color: "#92400e", fontWeight: 600, marginTop: 6 }}>Confianza baja · ETA inestable</span>
        ) : delay?.confidence === "medium" && d > 0 ? (
          <span style={{ fontSize: 10, color: "#b45309", fontWeight: 600, marginTop: 6, opacity: 0.92 }}>
            Confianza media
          </span>
        ) : delay?.confidence === "high" && d === 0 ? (
          <span style={{ fontSize: 10, color: suU, fontWeight: 500, marginTop: 6, opacity: 0.88 }}>Alta precisión</span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <span
        style={{
          fontSize: 10,
          color: suU,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.35,
        }}
      >
        ETA prevista
      </span>
      <span
        style={{
          fontSize: 15,
          fontWeight: 750,
          color: txU,
          lineHeight: 1.2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {headVis}
      </span>
      {showContractual ? (
        <span style={{ fontSize: 10, color: suU, fontWeight: 600, marginTop: 2, lineHeight: 1.3, opacity: 0.92 }}>
          Contrato · {contractualLabel}
        </span>
      ) : null}
      {d > 0 ? (
        <span style={{ fontSize: 11, color: "#b45309", fontWeight: 650, marginTop: 2, lineHeight: 1.3 }}>
          (+{d}m retraso operativo)
        </span>
      ) : delay?.situation === "rest_break" && delay.reason ? (
        <span style={{ fontSize: 10, color: "#15803d", fontWeight: 600, marginTop: 2, lineHeight: 1.3 }}>
          {delay.reason}
        </span>
      ) : null}
      {delay?.reason && d > 0 ? (
        <span style={{ fontSize: 10, color: "#92400e", fontWeight: 600, marginTop: 3, lineHeight: 1.35, opacity: 0.95 }}>
          {delay.reason}
        </span>
      ) : d > 0 && liveVisual?.situationLabel && delay?.situation && delay.situation !== "nominal" ? (
        <span style={{ fontSize: 10, color: "#92400e", fontWeight: 600, marginTop: 3, lineHeight: 1.35, opacity: 0.95 }}>
          {liveVisual.situationLabel}
        </span>
      ) : null}
      <span
        style={{
          fontSize: 10,
          color: suU,
          fontWeight: 700,
          marginTop: 4,
          textTransform: "uppercase",
          letterSpacing: 0.35,
        }}
      >
        Restan
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 650, color: sub, lineHeight: 1.25 }}>
        {formatEmpresaOperationalRestLine(visRemainingMins, opEta.remaining_km)}
      </span>
      <span
        style={{
          fontSize: 10,
          color: suU,
          fontWeight: 700,
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: 0.35,
        }}
      >
        Actualizado
      </span>
      <span style={{ fontSize: 11, color: sub, fontWeight: 600 }}>
        {formatSpanishAgo(opEta.updated_at || opEta.calculated_at, nowRef)}
      </span>
      {delay?.confidence === "low" && d > 0 ? (
        <span style={{ fontSize: 10, color: "#92400e", fontWeight: 600, marginTop: 4 }}>ETA inestable</span>
      ) : delay?.confidence === "medium" && d > 0 ? (
        <span style={{ fontSize: 10, color: "#b45309", fontWeight: 600, marginTop: 4, opacity: 0.92 }}>
          Precisión media
        </span>
      ) : delay?.confidence === "high" && d === 0 ? (
        <span style={{ fontSize: 10, color: suU, fontWeight: 500, marginTop: 4, opacity: 0.88 }}>Alta precisión</span>
      ) : null}
    </>
  );
}

function operationalEtaSnapshotBlockPropsEqual(prev, next) {
  if (prev.nowMs !== next.nowMs || prev.layout !== next.layout) return false;
  if (prev.tx !== next.tx || prev.su !== next.su || prev.subtle !== next.subtle) return false;
  const a = prev.servicio;
  const b = next.servicio;
  if (a !== b) {
    if (!a || !b || a.id !== b.id) return false;
    if (a.estado !== b.estado || a.referencia !== b.referencia) return false;
    if (JSON.stringify(a.operational_eta) !== JSON.stringify(b.operational_eta)) return false;
  }
  const la = prev.latestLocation;
  const lb = next.latestLocation;
  if (la !== lb) {
    if (!la && !lb) {
      /* ok */
    } else if (!la || !lb) return false;
    else if (la.lat !== lb.lat || la.lon !== lb.lon) return false;
    else if ((la.ts || la.updatedAt) !== (lb.ts || lb.updatedAt)) return false;
  }
  const ta = prev.tacografoEstado;
  const tb = next.tacografoEstado;
  if (ta !== tb) {
    if (!ta && !tb) {
      /* ok */
    } else if (!ta || !tb) return false;
    else if (ta.isDriving !== tb.isDriving || ta.crType !== tb.crType || Number(ta.crDur) !== Number(tb.crDur)) return false;
  }
  const sa = prev.activeStop;
  const sb = next.activeStop;
  if (sa !== sb) {
    if (!sa && !sb) {
      /* ok */
    } else if (!sa || !sb) return false;
    else if (sa.id !== sb.id || sa.hora_llegada_real !== sb.hora_llegada_real) return false;
  }
  return true;
}

export const OperationalEtaSnapshotBlock = memo(
  OperationalEtaSnapshotBlockImpl,
  operationalEtaSnapshotBlockPropsEqual,
);
