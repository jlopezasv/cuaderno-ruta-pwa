import { useEffect, useMemo, useRef, memo } from "react";
import { formatEmpresaOperationalRestLine, formatSpanishAgo } from "../../../domain/service/etaFormatter.js";
import {
  ETA_LABEL_ACTUAL,
  ETA_LABEL_INICIAL,
  OPERATIONAL_ETA_CALCULATING,
  resolveEtaInicialDisplayLabel,
  resolveEtaVisual,
  resolvePersistedEtaActualLabel,
} from "../../../domain/service/operationalEtaPresentation.js";
import { buildOperationalEtaVisual } from "../../../domain/service/operationalDeviationEngine.js";
import { useEtaVisualClockMs } from "../../../domain/service/useEtaVisualClock.js";

const lblStyle = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.35,
};

function EtaLabel({ children, su }) {
  return <span style={{ ...lblStyle, color: su }}>{children}</span>;
}

function EtaTime({ children, tx, accent }) {
  return (
    <span
      style={{
        fontSize: 17,
        fontWeight: 800,
        color: accent ? "#1d4ed8" : tx,
        lineHeight: 1.2,
        fontVariantNumeric: "tabular-nums",
        marginTop: 2,
        display: "block",
      }}
    >
      {children}
    </span>
  );
}

function delaySituationHint(delay, liveVisual, delayMins) {
  const d = Math.round(Number(delayMins) || 0);
  if (d > 0 && liveVisual?.situationLabel && delay?.situation && delay.situation !== "nominal") {
    return liveVisual.situationLabel;
  }
  if (delay?.situation === "rest_break") return "Descanso reglamentario";
  return null;
}

/** ETA inicial (fija) + ETA actual (guardada en servicio). Sin hora “live” ni términos técnicos. */
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
  const tickMs = useEtaVisualClockMs();
  const auxClockMs = nowMs != null && Number(nowMs) > 0 ? Number(nowMs) : tickMs;
  const txU = tx ?? "#0f172a";
  const suU = su ?? "#64748B";
  const sub = subtle ?? "#475569";
  const isEmpresa = layout === "empresa";
  const auxNowRef = useMemo(() => new Date(auxClockMs), [auxClockMs]);
  const v = resolveEtaVisual(servicio, auxNowRef);

  const inicialHead = useMemo(() => resolveEtaInicialDisplayLabel(servicio), [servicio?.id, servicio?.referencia]);

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
      kmProgressRef.current = { lastKm: rk, stableSinceMs: auxClockMs };
      return 0;
    }
    const since = prev.stableSinceMs ?? auxClockMs;
    kmProgressRef.current = { lastKm: prev.lastKm, stableSinceMs: since };
    return Math.max(0, auxClockMs - since);
  }, [v.tier, opRemainingKm, opUpdatedAt, auxClockMs, servicio?.id]);

  const liveVisual = useMemo(() => {
    if (v.tier !== "operational") return null;
    return buildOperationalEtaVisual({
      servicio,
      now: auxNowRef,
      latestLocation,
      tacografoEstado,
      activeStop,
      progressMemory: kmStableMs == null ? null : { kmStableMs },
      resolvedVisual: v,
    });
  }, [servicio, v, auxNowRef, latestLocation, tacografoEstado, activeStop, kmStableMs]);

  if (!servicio || servicio.estado === "anulado" || v.tier === "none") {
    return (
      <>
        <EtaTime tx={txU}>—</EtaTime>
        <EtaLabel su={suU}>{ETA_LABEL_INICIAL}</EtaLabel>
      </>
    );
  }

  if (v.tier === "calculating") {
    return (
      <>
        <EtaLabel su={suU}>{ETA_LABEL_INICIAL}</EtaLabel>
        <EtaTime tx={txU}>{inicialHead || "—"}</EtaTime>
        <EtaLabel su={suU}>{ETA_LABEL_ACTUAL}</EtaLabel>
        <span style={{ fontSize: 14, fontWeight: 650, color: sub, lineHeight: 1.3, marginTop: 2 }}>
          {OPERATIONAL_ETA_CALCULATING}
        </span>
      </>
    );
  }

  if (v.tier === "plan") {
    const rest = formatEmpresaOperationalRestLine(v.remainingMins, v.remainingKm);
    return (
      <>
        <EtaLabel su={suU}>{ETA_LABEL_INICIAL}</EtaLabel>
        <EtaTime tx={txU}>{inicialHead || "—"}</EtaTime>
        <EtaLabel su={suU}>{ETA_LABEL_ACTUAL}</EtaLabel>
        <span style={{ fontSize: 14, fontWeight: 650, color: sub, lineHeight: 1.3, marginTop: 2 }}>
          {OPERATIONAL_ETA_CALCULATING}
        </span>
        {rest && rest !== "—" ? (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: sub, marginTop: 8, display: "block" }}>
            {rest}
          </span>
        ) : null}
      </>
    );
  }

  const opEta = v.operational;
  const delay = liveVisual?.delay;
  const d = Math.round(Number(delay?.delayMins) || 0);
  const actualHead = resolvePersistedEtaActualLabel(opEta) || "—";
  const hint = delaySituationHint(delay, liveVisual, d);
  const restLine = formatEmpresaOperationalRestLine(opEta.remaining_mins, opEta.remaining_km);
  const updatedAgo = formatSpanishAgo(opEta.updated_at || opEta.calculated_at, auxNowRef);

  if (isEmpresa) {
    return (
      <>
        <EtaLabel su={suU}>{ETA_LABEL_INICIAL}</EtaLabel>
        <EtaTime tx={txU}>{inicialHead || "—"}</EtaTime>
        <EtaLabel su={suU}>{ETA_LABEL_ACTUAL}</EtaLabel>
        <EtaTime tx={txU} accent>
          {actualHead}
        </EtaTime>
        {d > 0 ? (
          <span style={{ fontSize: 12, color: "#b45309", fontWeight: 750, marginTop: 6, lineHeight: 1.35 }}>
            +{d} min de retraso
          </span>
        ) : null}
        {hint ? (
          <span style={{ fontSize: 11, color: "#92400e", fontWeight: 650, marginTop: 4, lineHeight: 1.4 }}>
            {hint}
          </span>
        ) : null}
        {restLine && restLine !== "—" ? (
          <span style={{ fontSize: 12.5, fontWeight: 650, color: sub, marginTop: 8, display: "block" }}>
            {restLine}
          </span>
        ) : null}
        {updatedAgo && updatedAgo !== "—" ? (
          <span style={{ fontSize: 11, color: sub, fontWeight: 600, marginTop: 6, display: "block" }}>
            Actualizado {updatedAgo}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <EtaLabel su={suU}>{ETA_LABEL_INICIAL}</EtaLabel>
      <EtaTime tx={txU}>{inicialHead || "—"}</EtaTime>
      <EtaLabel su={suU}>{ETA_LABEL_ACTUAL}</EtaLabel>
      <EtaTime tx={txU} accent>
        {actualHead}
      </EtaTime>
      {d > 0 ? (
        <span style={{ fontSize: 11, color: "#b45309", fontWeight: 650, marginTop: 4, lineHeight: 1.3 }}>
          +{d} min de retraso
        </span>
      ) : null}
      {hint ? (
        <span style={{ fontSize: 10, color: "#92400e", fontWeight: 600, marginTop: 3, lineHeight: 1.35 }}>
          {hint}
        </span>
      ) : null}
      {restLine && restLine !== "—" ? (
        <span style={{ fontSize: 12.5, fontWeight: 650, color: sub, marginTop: 6, display: "block" }}>
          {restLine}
        </span>
      ) : null}
      {updatedAgo && updatedAgo !== "—" ? (
        <span style={{ fontSize: 11, color: sub, fontWeight: 600, marginTop: 4, display: "block" }}>
          Actualizado {updatedAgo}
        </span>
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
