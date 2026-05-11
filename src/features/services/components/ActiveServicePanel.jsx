import { useEffect, useMemo, useState } from "react";
import { ESTADO_COLOR, ESTADO_LABEL } from "../../../domain/fleet/serviceStatus";
import {
  countServiceDocuments,
  getDocumentLabel,
} from "../../../domain/service/serviceDocuments";
import { getCurrentStop } from "../../../domain/service/serviceStops";
import { getLastServiceActivity } from "../../../domain/service/serviceActivity";
import { getAttentionReason, needsAttention } from "../../../domain/service/serviceAttention";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "../../../domain/service/serviceOperationalStatus";
import { getServiceEta } from "../../../domain/service/serviceEta";
import { getUnifiedTripPresentation } from "../../../domain/service/activeTripState";
import {
  getOperationalTripStartedAt,
  getOperationalPlanSnapshot,
  stripServicioOperacionDisplay,
} from "../../../domain/service/serviceOperacionMeta.js";
import { getInicioOperacionMs, stripOperacionMetaDisplay } from "../../../domain/service/stopOperacionMeta.js";

const DRIVER_UI = {
  bg: "#f8fafc",
  rail: "#e2e8f0",
  card: "#ffffff",
  soft: "#f1f5f9",
  tx: "#0f172a",
  su: "#475569",
  muted: "#64748b",
  line: "#e2e8f0",
  green: "#16a34a",
  greenSoft: "#dcfce7",
  amber: "#d97706",
  amberSoft: "#fffbeb",
  red: "#dc2626",
  redSoft: "#fee2e2",
  blue: "#2563eb",
  blueSoft: "#eff6ff",
};

function flattenEvidencias(evidenciasByStop) {
  const out = [];
  if (!evidenciasByStop || typeof evidenciasByStop !== "object") return out;
  for (const arr of Object.values(evidenciasByStop)) {
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

function countIncidencias(evidenciasByStop) {
  return flattenEvidencias(evidenciasByStop).filter((e) => e?.tipo === "incidencia").length;
}

function recentEvidenciasFlat(evidenciasByStop, limit) {
  return flattenEvidencias(evidenciasByStop)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

export function getCockpitSignals(servicio, stops, evidenciasByStop) {
  const lastActivity = getLastServiceActivity({
    service: servicio,
    stops,
    evidencias: evidenciasByStop,
  });
  const operationalStatus = getOperationalStatus({
    service: servicio,
    stops,
    evidencias: evidenciasByStop,
  });
  const operationalMeta = OPERATIONAL_STATUS_META[operationalStatus];
  const attention = needsAttention({
    service: servicio,
    stops,
    evidencias: evidenciasByStop,
    lastActivity,
  });
  const attentionReason = attention
    ? getAttentionReason({
        service: servicio,
        stops,
        evidencias: evidenciasByStop,
        lastActivity,
      })
    : "";
  const docTotal = countServiceDocuments(stops, evidenciasByStop);
  const incidenciasN = countIncidencias(evidenciasByStop);
  const recientes = recentEvidenciasFlat(evidenciasByStop, 4);
  return {
    lastActivity,
    operationalMeta,
    attention,
    attentionReason,
    docTotal,
    incidenciasN,
    recientes,
  };
}

function CockpitSection({ title, children, first }) {
  return (
    <div
      style={{
        paddingTop: first ? 0 : 16,
        marginTop: first ? 0 : 16,
        borderTop: first ? "none" : `1px solid ${DRIVER_UI.line}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: DRIVER_UI.muted,
          fontWeight: 750,
          letterSpacing: 0.9,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function fmtPlanKm(km) {
  const n = Number(km);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} km` : "—";
}

function fmtPlanDrive(plan) {
  return plan?.planned_drive_time || (Number.isFinite(Number(plan?.planned_drive_min)) ? `${Math.floor(Number(plan.planned_drive_min) / 60)}h ${Number(plan.planned_drive_min) % 60}m` : "—");
}

function formatBreaks(plan) {
  if (!plan || plan.planned_breaks == null) return "—";
  const n = Number(plan.planned_breaks) || 0;
  return `${n} pausa${n === 1 ? "" : "s"} restante${n === 1 ? "" : "s"}`;
}

function looksLikeLatLonName(value) {
  return /^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(String(value || "").trim());
}

function safePlaceName(value, fallback) {
  const t = String(value || "").trim();
  if (!t || looksLikeLatLonName(t)) return fallback;
  return t;
}

function stopOperationalGroup(stop) {
  const t = String(stop?.tipo || "").toLowerCase();
  if (t === "carga") return "carga";
  if (t === "descarga") return "descarga";
  if (t.includes("carga") && t.includes("descarga")) return "carga_descarga";
  return "otra";
}

function stopTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function opTime(ms) {
  if (ms == null) return "—";
  return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function stopActionLabel(stop) {
  const g = stopOperationalGroup(stop);
  if (g === "descarga") return "Inicio descarga";
  if (g === "carga_descarga") return "Inicio carga/descarga";
  return "Inicio carga";
}

function ChronoStopCard({
  stop,
  servicio,
  tx,
  su,
  onConfirmMuelle,
  onStartStopOperation,
}) {
  const entrada = !!stop.hora_llegada_real;
  const inicioMs = getInicioOperacionMs(stop);
  const salida = !!stop.hora_salida_real;
  const visibleNotas = stripOperacionMetaDisplay(stop.notas);
  const cliente = stripServicioOperacionDisplay(servicio?.referencia) || "—";

  const step = (done, label, value) => (
    <div style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 8, alignItems: "center", fontSize: 12 }}>
      <span style={{ color: done ? DRIVER_UI.green : "#94a3b8", fontSize: 13 }}>{done ? "✓" : "○"}</span>
      <span style={{ color: done ? DRIVER_UI.tx : DRIVER_UI.su, fontWeight: done ? 700 : 550 }}>{label}</span>
      <span style={{ color: done ? DRIVER_UI.su : DRIVER_UI.muted, fontFamily: "monospace" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 14, padding: "12px 12px 13px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 750, color: DRIVER_UI.tx, lineHeight: 1.25 }}>{stop.nombre || `Parada ${stop.orden}`}</div>
          {stop.direccion ? <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 3 }}>{stop.direccion}</div> : null}
          <div style={{ fontSize: 11, color: DRIVER_UI.muted, marginTop: 4, lineHeight: 1.35 }}>
            Cliente: <span style={{ color: DRIVER_UI.su, fontWeight: 650 }}>{cliente}</span>
            {visibleNotas ? <> · Ref: <span style={{ color: DRIVER_UI.amber, fontWeight: 650 }}>{visibleNotas}</span></> : null}
          </div>
        </div>
        <span style={{ color: salida ? DRIVER_UI.green : entrada ? DRIVER_UI.amber : DRIVER_UI.muted, background: salida ? DRIVER_UI.greenSoft : entrada ? DRIVER_UI.amberSoft : DRIVER_UI.soft, borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 750, whiteSpace: "nowrap" }}>
          {salida ? "Completado" : entrada ? "En muelle" : "Pendiente"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 11 }}>
        {step(entrada, "Entrada muelle", stopTime(stop.hora_llegada_real))}
        {step(!!inicioMs, stopActionLabel(stop), opTime(inicioMs))}
        {step(salida, "Salida muelle", stopTime(stop.hora_salida_real))}
      </div>

      {!salida ? (
        <div style={{ display: "grid", gridTemplateColumns: entrada ? "1fr 1fr" : "1fr", gap: 8 }}>
          {!entrada ? (
            <button type="button" onClick={() => onConfirmMuelle?.({ kind: "entrada", stopId: stop.id })} style={{ background: DRIVER_UI.green, color: "white", border: "none", borderRadius: 10, padding: "10px", fontSize: 12, fontWeight: 750, cursor: "pointer" }}>
              Entrada muelle
            </button>
          ) : !inicioMs ? (
            <button type="button" onClick={() => onStartStopOperation?.(stop.id)} style={{ background: DRIVER_UI.soft, color: DRIVER_UI.tx, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 10, padding: "10px", fontSize: 12, fontWeight: 750, cursor: "pointer" }}>
              {stopActionLabel(stop)}
            </button>
          ) : null}
          {entrada ? (
            <button type="button" onClick={() => onConfirmMuelle?.({ kind: "salida", stopId: stop.id })} style={{ background: DRIVER_UI.amber, color: "white", border: "none", borderRadius: 10, padding: "10px", fontSize: 12, fontWeight: 750, cursor: "pointer" }}>
              Salida muelle
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChronoStopSection({ title, emptyText, stops, servicio, tx, su, onConfirmMuelle, onStartStopOperation }) {
  return (
    <CockpitSection title={title}>
      {stops.length ? (
        stops.map((stop) => (
          <ChronoStopCard
            key={stop.id}
            stop={stop}
            servicio={servicio}
            tx={tx}
            su={su}
            onConfirmMuelle={onConfirmMuelle}
            onStartStopOperation={onStartStopOperation}
          />
        ))
      ) : (
        <div style={{ fontSize: 13, color: DRIVER_UI.muted, background: DRIVER_UI.soft, borderRadius: 10, padding: "11px 12px" }}>{emptyText}</div>
      )}
    </CockpitSection>
  );
}

/** Bloque compacto: mismo motor ETA/norma vía `presentation` (getServiceEta + getUnifiedTripPresentation). */
export function OperativaViajeBlock({
  servicio,
  presentation,
  tx,
  su,
  onOpenViajeModal,
  onRetryViajePlan,
  onStartOperationalTrip,
  viajeOpIniciado = false,
  showViajeCta = true,
  viajeCtaLabel = "Añadir destino al servicio",
  hideEta = false,
  hideRuta = false,
  dense = false,
}) {
  const plan = getOperationalPlanSnapshot(servicio);
  const routePlanStatus = plan?.route_plan_status || (plan?.status === "calculating" ? "pending" : plan?.status === "failed" || (plan?.status === "degraded" && !plan?.planned_eta) ? "failed" : plan?.planned_eta ? "ready" : "pending");
  const planCalculating = routePlanStatus === "pending" && plan?.status === "calculating";
  const planFailed = routePlanStatus === "failed";
  const openRouteModal = () =>
    onOpenViajeModal?.({
      destino: plan?.planned_destination || servicio?.destino?.trim() || "",
      origen: safePlaceName(plan?.planned_origin || servicio?.origen, ""),
      waypoint: plan?.input_waypoint || plan?.planned_waypoint || "",
      velocidad: plan?.velocidad || 80,
      gpsOrigen:
        Number.isFinite(Number(plan?.input_origin_lat)) && Number.isFinite(Number(plan?.input_origin_lon))
          ? { lat: Number(plan.input_origin_lat), lon: Number(plan.input_origin_lon) }
          : null,
      servicioId: servicio?.id,
      referenciaActual: servicio?.referencia ?? null,
    });
  const etaBig =
    (planCalculating ? "Calculando..." : plan?.planned_eta_label) ||
    (presentation.etaOperacionalLabel === "…"
      ? "…"
      : presentation.etaOperacionalLabel === "Sin ETA"
        ? "—"
        : presentation.etaOperacionalLabel);
  const routeHeadline = plan
    ? `${safePlaceName(plan.planned_origin || servicio?.origen, "Ubicación actual")} → ${safePlaceName(plan.planned_destination || servicio?.destino, "Destino")}`
    : presentation.rutaHeadline;

  const pad = dense ? "10px 11px 12px" : "14px 14px 16px";
  const etaSize = dense ? 24 : 28;

  return (
    <div
      style={{
        background: DRIVER_UI.card,
        borderRadius: dense ? 12 : 14,
        padding: pad,
        border: `1px solid ${DRIVER_UI.line}`,
      }}
    >
      {showViajeCta ? (
        <button
          type="button"
          onClick={() =>
            openRouteModal()
          }
          style={{
            width: "100%",
            background: DRIVER_UI.amberSoft,
            color: DRIVER_UI.amber,
            border: "1px solid #fed7aa",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 4,
          }}
        >
          {viajeCtaLabel}
        </button>
      ) : null}

      {!hideEta ? (
        <div style={{ marginTop: showViajeCta ? 10 : 0 }}>
          <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 6 }}>Llegada estimada</div>
          <div
            style={{
              fontSize: etaSize,
              fontWeight: 900,
              color: DRIVER_UI.tx,
              letterSpacing: -0.3,
              lineHeight: 1.15,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {etaBig}
          </div>
          <div style={{ fontSize: 11, color: DRIVER_UI.muted, marginTop: 6 }}>Estimación operacional</div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: hideEta ? (showViajeCta ? 10 : 0) : 16,
          paddingTop: hideEta ? 0 : 14,
          borderTop: hideEta && !showViajeCta ? "none" : `1px solid ${DRIVER_UI.line}`,
        }}
      >
        {planCalculating ? (
          <div style={{ background: DRIVER_UI.amberSoft, border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 11px", color: DRIVER_UI.amber, fontSize: 13, fontWeight: 750, lineHeight: 1.35 }}>
            Calculando planificación operacional...
            <div style={{ color: DRIVER_UI.muted, fontSize: 11, fontWeight: 550, marginTop: 4 }}>La ruta completa quedará guardada como snapshot estable.</div>
          </div>
        ) : planFailed ? (
          <div style={{ background: DRIVER_UI.redSoft, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 11px", color: DRIVER_UI.red, fontSize: 13, fontWeight: 750, lineHeight: 1.35 }}>
            No se pudo calcular ruta completa
            <div style={{ color: DRIVER_UI.muted, fontSize: 11, fontWeight: 550, marginTop: 4 }}>Revisa origen/destino o recalcula más tarde.</div>
          </div>
        ) : plan ? (
          <details style={{ background: DRIVER_UI.soft, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 12, padding: "10px 11px" }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: DRIVER_UI.su, fontWeight: 700 }}>Plan operacional y tacógrafo</summary>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 3 }}>Distancia</div>
                <div style={{ fontSize: dense ? 15 : 17, fontWeight: 750, color: DRIVER_UI.tx }}>{fmtPlanKm(plan.planned_km)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 3 }}>Conducción</div>
                <div style={{ fontSize: dense ? 15 : 17, fontWeight: 750, color: DRIVER_UI.green }}>{fmtPlanDrive(plan)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 3 }}>Pausas</div>
                <div style={{ fontSize: 13, fontWeight: 650, color: DRIVER_UI.tx }}>{formatBreaks(plan)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 3 }}>Descanso</div>
                <div style={{ fontSize: 13, fontWeight: 650, color: DRIVER_UI.tx }}>{plan.planned_daily_rest_label || "—"}</div>
              </div>
            </div>
          </details>
        ) : (
          <>
            <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 4 }}>Conducción disponible</div>
            <div style={{ fontSize: dense ? 15 : 17, fontWeight: 750, color: DRIVER_UI.green }}>
              {presentation.tiempoConduccionDisponible}
            </div>
          </>
        )}
      </div>

      {!hideRuta ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 4 }}>Ruta activa</div>
          <div style={{ fontSize: 15, fontWeight: 650, color: DRIVER_UI.tx, lineHeight: 1.35 }}>{routeHeadline}</div>
          {plan?.planned_summary ? <div style={{ fontSize: 11, color: DRIVER_UI.muted, marginTop: 5, lineHeight: 1.35 }}>{plan.planned_summary}</div> : null}
          {planFailed ? <div style={{ fontSize: 11, color: DRIVER_UI.red, marginTop: 5 }}>Operación sin ruta completa calculada.</div> : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {!viajeOpIniciado ? (
          <button
            type="button"
            onClick={() => onStartOperationalTrip?.(servicio?.id)}
            style={{
              flex: "1 1 100%",
              background: DRIVER_UI.green,
              color: "white",
              border: "none",
              borderRadius: 10,
              padding: "10px",
              fontSize: 13,
              fontWeight: 750,
              cursor: "pointer",
            }}
          >
            Iniciar viaje operacional
          </button>
        ) : null}
        {planFailed ? (
          <button
            type="button"
            onClick={() => onRetryViajePlan?.(servicio)}
            style={{
              flex: "1 1 150px",
              background: DRIVER_UI.amberSoft,
              color: DRIVER_UI.amber,
              border: "1px solid #fed7aa",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 750,
              cursor: "pointer",
            }}
          >
            Reintentar cálculo
          </button>
        ) : null}
        <button
          type="button"
          onClick={openRouteModal}
          style={{
            flex: "1 1 150px",
            background: DRIVER_UI.soft,
            color: DRIVER_UI.su,
            border: `1px solid ${DRIVER_UI.line}`,
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 750,
            cursor: "pointer",
          }}
        >
          Modificar ruta
        </button>
      </div>
    </div>
  );
}

export function CockpitShell({ children, dense = false }) {
  return (
    <div
      style={{
        background: DRIVER_UI.bg,
        borderRadius: dense ? 14 : 18,
        border: `1px solid ${DRIVER_UI.line}`,
        boxShadow: "0 10px 30px rgba(15,23,42,.06)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ padding: dense ? "10px 12px 12px" : "16px 14px 18px" }}>{children}</div>
    </div>
  );
}

function primaryEtaText(label) {
  const value = String(label || "").trim();
  if (!value || value === "Sin ETA" || value === "…") return "—";
  const match = value.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : value;
}

function CurrentActionCard({ action }) {
  if (!action) return null;
  const tone =
    action.tone === "amber"
      ? { bg: DRIVER_UI.amberSoft, fg: DRIVER_UI.amber, border: "#fed7aa" }
      : action.tone === "blue"
        ? { bg: DRIVER_UI.blueSoft, fg: DRIVER_UI.blue, border: "#bfdbfe" }
        : { bg: DRIVER_UI.greenSoft, fg: DRIVER_UI.green, border: "#bbf7d0" };
  return (
    <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 16, padding: "14px 14px 15px", marginTop: 12 }}>
      <div style={{ fontSize: 10, color: DRIVER_UI.muted, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>QUÉ TOCA AHORA</div>
      <div style={{ fontSize: 13, color: DRIVER_UI.su, marginBottom: 10 }}>Próxima acción</div>
      <button
        type="button"
        disabled={action.disabled}
        onClick={action.onClick}
        style={{
          width: "100%",
          background: tone.bg,
          color: tone.fg,
          border: `1px solid ${tone.border}`,
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 16,
          fontWeight: 750,
          cursor: action.disabled ? "default" : "pointer",
          opacity: action.disabled ? 0.7 : 1,
        }}
      >
        {action.label}
      </button>
      {action.sub ? <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 9, lineHeight: 1.4 }}>{action.sub}</div> : null}
    </div>
  );
}

/**
 * Cockpit operativo — tab Servicio. Solo presentación; handlers del padre.
 */
export function ActiveServicePanel({
  mode,
  servicio,
  stops,
  completados,
  evidenciasByStop,
  showToast,
  onIniciarServicio,
  onIniciarViajeOperacional,
  marcarInicioOperacionStop,
  marcarLlegado,
  marcarCompletado,
  recargar,
  EvidenciasStopComponent,
  card = DRIVER_UI.card,
  tx = DRIVER_UI.tx,
  su = DRIVER_UI.muted,
  norma,
  viajeActivo = null,
  onOpenViajeModal,
  onRetryViajePlan,
  conductorNombre = "Conductor",
}) {
  const sig = getCockpitSignals(servicio, stops, evidenciasByStop);
  const estadoColor = ESTADO_COLOR[servicio.estado] || su;
  const [etaSlot, setEtaSlot] = useState(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [confirmMuelle, setConfirmMuelle] = useState(null);
  const [confirmMuelleSaving, setConfirmMuelleSaving] = useState(false);
  const viajeOpIniciado = !!getOperationalTripStartedAt(servicio);
  const planSnapshot = useMemo(() => getOperationalPlanSnapshot(servicio), [servicio?.referencia]);
  const routeTitle = `${planSnapshot?.planned_origin || safePlaceName(servicio?.origen, "Ubicación actual")} → ${planSnapshot?.planned_destination || safePlaceName(servicio?.destino, "Destino")}`;
  const stableEtaSlot = useMemo(() => {
    const plan = planSnapshot;
    if (plan?.route_plan_status === "pending" || plan?.status === "calculating") {
      return {
        eta: null,
        label: "Calculando planificación operacional...",
        confidence: "pending",
        stable: true,
      };
    }
    if (!plan?.planned_eta) return null;
    return {
      eta: plan.planned_eta,
      label: plan.planned_eta_label || "ETA prevista",
      confidence: plan.confidence || "medium",
      stable: true,
    };
  }, [planSnapshot]);
  const presentation = useMemo(
    () =>
      getUnifiedTripPresentation({
        viajeActivo,
        servicio,
        norma,
        etaSlot: etaSlot || stableEtaSlot,
        etaLoading: stableEtaSlot ? false : etaLoading,
      }),
    [viajeActivo, servicio, norma, etaSlot, stableEtaSlot, etaLoading],
  );
  const cargas = useMemo(
    () => stops.filter((s) => ["carga", "carga_descarga"].includes(stopOperationalGroup(s))),
    [stops],
  );
  const descargas = useMemo(
    () => stops.filter((s) => ["descarga", "carga_descarga"].includes(stopOperationalGroup(s))),
    [stops],
  );
  const etaHeader = primaryEtaText(planSnapshot?.planned_eta_label || presentation.etaOperacionalLabel);
  const statusTone = estadoColor || DRIVER_UI.muted;
  const planSummary = planSnapshot?.planned_summary || null;

  const buildStopAction = (stop) => {
    if (!stop) {
      return { label: "Sin acción pendiente", sub: "No hay paradas pendientes en este servicio.", disabled: true, tone: "blue" };
    }
    const entrada = !!stop.hora_llegada_real;
    const inicioMs = getInicioOperacionMs(stop);
    const salida = !!stop.hora_salida_real;
    if (!viajeOpIniciado) {
      return {
        label: "Iniciar viaje",
        sub: "Activa el viaje operacional cuando empiece realmente la ruta principal.",
        tone: "green",
        onClick: () => onIniciarViajeOperacional?.(servicio?.id),
      };
    }
    if (!entrada) {
      return {
        label: "Entrada muelle",
        sub: stop.nombre || "Registra llegada a la parada actual.",
        tone: "green",
        onClick: () => setConfirmMuelle({ kind: "entrada", stopId: stop.id }),
      };
    }
    if (!inicioMs) {
      return {
        label: stopActionLabel(stop),
        sub: stop.nombre || "Inicia la operación de esta parada.",
        tone: "blue",
        onClick: () => marcarInicioOperacionStop?.(stop.id),
      };
    }
    if (!salida) {
      return {
        label: "Salida de muelle",
        sub: stop.nombre || "Cierra la operación de esta parada.",
        tone: "amber",
        onClick: () => setConfirmMuelle({ kind: "salida", stopId: stop.id }),
      };
    }
    return {
      label: "Continuar ruta",
      sub: "Parada completada. Revisa la siguiente acción en el timeline.",
      disabled: true,
      tone: "blue",
    };
  };

  useEffect(() => {
    let cancelled = false;
    if (stableEtaSlot) {
      setEtaSlot(stableEtaSlot);
      setEtaLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setEtaLoading(true);
    setEtaSlot(null);

    const run = async (pos) => {
      try {
        const r = await getServiceEta({
          service: servicio,
          stops,
          norma: norma ?? null,
          currentPosition: pos,
          operationalTripStarted: viajeOpIniciado,
        });
        if (!cancelled) setEtaSlot(r);
      } catch {
        if (!cancelled) setEtaSlot(null);
      } finally {
        if (!cancelled) setEtaLoading(false);
      }
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => run({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => run(null),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
      );
    } else {
      run(null);
    }

    return () => {
      cancelled = true;
    };
  }, [
    servicio?.id,
    servicio?.origen,
    servicio?.destino,
    servicio?.estado,
    servicio?.fecha_inicio,
    servicio?.referencia,
    stops,
    norma,
    viajeOpIniciado,
    stableEtaSlot,
  ]);

  if (import.meta.env.DEV) {
    console.log("[AUDIT PR-22B] RENDER ActiveServicePanel", {
      mode,
      servicioEstado: servicio?.estado,
      bloqueOperativa: true,
    });
  }

  const handleConfirmMuelle = async () => {
    if (!confirmMuelle || confirmMuelleSaving) return;
    const { kind, stopId } = confirmMuelle;
    setConfirmMuelleSaving(true);
    try {
      if (kind === "entrada") {
        await marcarLlegado(stopId);
        await recargar?.();
        showToast?.("Entrada en muelle registrada");
      } else {
        await marcarCompletado(stopId);
        await recargar?.();
        showToast?.("Salida de muelle registrada");
      }
      setConfirmMuelle(null);
    } catch (error) {
      showToast?.(error?.message || "No se pudo registrar el muelle");
    } finally {
      setConfirmMuelleSaving(false);
    }
  };

  const confirmMuelleDialog = confirmMuelle ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.35)",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={() => !confirmMuelleSaving && setConfirmMuelle(null)}
    >
      <div
        role="dialog"
        style={{
          background: DRIVER_UI.card,
          borderRadius: 16,
          padding: "20px 18px",
          maxWidth: 400,
          width: "100%",
          border: `1px solid ${DRIVER_UI.line}`,
          boxShadow: "0 20px 50px rgba(15,23,42,.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 750, color: DRIVER_UI.tx, marginBottom: 8 }}>
          {confirmMuelle.kind === "entrada" ? "¿Confirmar entrada en muelle?" : "¿Confirmar salida de muelle?"}
        </div>
        <div style={{ fontSize: 13, color: DRIVER_UI.su, lineHeight: 1.45, marginBottom: 18 }}>
          {confirmMuelle.kind === "entrada"
            ? "Se registrará la hora de entrada en el expediente operacional."
            : "Se registrará la salida y, si corresponde, se avanzará la parada."}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            disabled={confirmMuelleSaving}
            onClick={() => setConfirmMuelle(null)}
            style={{
              flex: 1,
              background: DRIVER_UI.soft,
              color: DRIVER_UI.su,
              border: `1px solid ${DRIVER_UI.line}`,
              borderRadius: 12,
              padding: "12px",
              fontWeight: 700,
              cursor: confirmMuelleSaving ? "default" : "pointer",
              opacity: confirmMuelleSaving ? 0.65 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={confirmMuelleSaving}
            onClick={handleConfirmMuelle}
            style={{
              flex: 1,
              background: confirmMuelle.kind === "entrada" ? DRIVER_UI.green : DRIVER_UI.amber,
              color: "white",
              border: "none",
              borderRadius: 12,
              padding: "12px",
              fontWeight: 800,
              cursor: confirmMuelleSaving ? "default" : "pointer",
              opacity: confirmMuelleSaving ? 0.75 : 1,
            }}
          >
            {confirmMuelleSaving ? "Guardando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (mode === "asignado") {
    const nextStop = stops.find((s) => s.estado === "pendiente") || stops[0] || null;
    const currentAction = {
      label: "Iniciar servicio",
      sub: nextStop ? `Primera parada: ${nextStop.nombre}` : "Activa el servicio para empezar la operación.",
      tone: "green",
      onClick: () => onIniciarServicio(servicio.id).then(() => showToast("Servicio iniciado")),
    };
    return (
      <div style={{ padding: "12px 10px 88px", maxWidth: 560, margin: "0 auto", background: DRIVER_UI.bg }}>
        <CockpitShell>
          <CockpitSection title="SERVICIO" first>
            <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 16, padding: "15px 14px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: DRIVER_UI.tx, letterSpacing: -0.4, lineHeight: 1 }}>{etaHeader}</div>
              <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 4 }}>Llegada estimada</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: DRIVER_UI.tx, lineHeight: 1.3, marginTop: 12 }}>{routeTitle}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: statusTone, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: DRIVER_UI.su, fontWeight: 650 }}>{ESTADO_LABEL[servicio.estado] || servicio.estado}</span>
                <span style={{ fontSize: 12, color: DRIVER_UI.muted }}>· {sig.operationalMeta.label}</span>
              </div>
              {planSummary ? <div style={{ fontSize: 11, color: DRIVER_UI.muted, marginTop: 10, lineHeight: 1.35 }}>{planSummary}</div> : null}
            </div>
            <CurrentActionCard action={currentAction} />
            {sig.attention && (
              <div style={{ marginTop: 10 }}>
                <span style={{ background: DRIVER_UI.amberSoft, color: DRIVER_UI.amber, borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 750 }}>Atención requerida</span>
                {sig.attentionReason ? <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 6, lineHeight: 1.45 }}>{sig.attentionReason}</div> : null}
              </div>
            )}
          </CockpitSection>

          <ChronoStopSection
            title="CARGAS"
            emptyText="Sin cargas definidas para este servicio."
            stops={cargas}
            servicio={servicio}
            tx={tx}
            su={su}
            onConfirmMuelle={setConfirmMuelle}
            onStartStopOperation={marcarInicioOperacionStop}
          />

          <CockpitSection title="VIAJE OPERACIONAL">
            <OperativaViajeBlock
              servicio={servicio}
              presentation={presentation}
              tx={tx}
              su={su}
              onOpenViajeModal={onOpenViajeModal}
              onRetryViajePlan={onRetryViajePlan}
              onStartOperationalTrip={onIniciarViajeOperacional}
              viajeOpIniciado={viajeOpIniciado}
              showViajeCta={!planSnapshot}
            />
          </CockpitSection>

          <ChronoStopSection
            title="DESCARGAS"
            emptyText="Sin descargas definidas para este servicio."
            stops={descargas}
            servicio={servicio}
            tx={tx}
            su={su}
            onConfirmMuelle={setConfirmMuelle}
            onStartStopOperation={marcarInicioOperacionStop}
          />

          <CockpitSection title="DOCUMENTACIÓN">
            <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 14, padding: "12px 12px" }}>
            <div style={{ fontSize: 15, color: DRIVER_UI.tx, marginBottom: 6 }}>
              <strong style={{ color: DRIVER_UI.blue }}>{sig.docTotal}</strong>{" "}
              <span style={{ color: DRIVER_UI.muted, fontSize: 13 }}>evidencias totales</span>
            </div>
            <div style={{ fontSize: 15, color: DRIVER_UI.tx, marginBottom: 12 }}>
              <strong style={{ color: sig.incidenciasN ? DRIVER_UI.amber : DRIVER_UI.muted }}>{sig.incidenciasN}</strong>{" "}
              <span style={{ color: DRIVER_UI.muted, fontSize: 13 }}>incidencias</span>
            </div>
            {sig.recientes.length ? (
              <div>
                <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 8 }}>Recientes</div>
                {sig.recientes.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      fontSize: 13,
                      color: DRIVER_UI.su,
                      padding: "8px 0",
                      borderBottom: `1px solid ${DRIVER_UI.line}`,
                    }}
                  >
                    <span style={{ color: DRIVER_UI.amber, fontWeight: 650 }}>{getDocumentLabel(ev)}</span>
                    <span style={{ color: DRIVER_UI.muted, fontSize: 11, marginLeft: 8 }}>
                      {new Date(ev.created_at).toLocaleString("es-ES", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: DRIVER_UI.muted }}>Sin evidencias aún.</div>
            )}
            </div>
          </CockpitSection>

        </CockpitShell>
        {confirmMuelleDialog}
      </div>
    );
  }

  const stopMostrar = getCurrentStop(stops);
  if (!stopMostrar) return null;
  const estaEnParada = stopMostrar.estado === "llegado";
  const Ev = EvidenciasStopComponent;
  const currentAction = buildStopAction(stopMostrar);

  return (
    <div style={{ padding: "12px 10px 88px", maxWidth: 560, margin: "0 auto", background: DRIVER_UI.bg }}>
      <CockpitShell>
        <CockpitSection title="SERVICIO" first>
          <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 16, padding: "15px 14px" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: DRIVER_UI.tx, letterSpacing: -0.4, lineHeight: 1 }}>{etaHeader}</div>
            <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 4 }}>Llegada estimada</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: DRIVER_UI.tx, lineHeight: 1.3, marginTop: 12 }}>{routeTitle}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: statusTone, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: DRIVER_UI.su, fontWeight: 650 }}>{ESTADO_LABEL[servicio.estado] || servicio.estado}</span>
              <span style={{ fontSize: 12, color: DRIVER_UI.muted }}>· {estaEnParada ? "En parada" : "Próxima parada"}: {stopMostrar.nombre}</span>
            </div>
            {planSummary ? <div style={{ fontSize: 11, color: DRIVER_UI.muted, marginTop: 10, lineHeight: 1.35 }}>{planSummary}</div> : null}
          </div>
          <CurrentActionCard action={currentAction} />
          {sig.attention && (
            <div style={{ marginTop: 6 }}>
              <span style={{ background: DRIVER_UI.amberSoft, color: DRIVER_UI.amber, borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 750 }}>Atención requerida</span>
              {sig.attentionReason ? <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 6, lineHeight: 1.45 }}>{sig.attentionReason}</div> : null}
            </div>
          )}
        </CockpitSection>

        <ChronoStopSection
          title="CARGAS"
          emptyText="Sin cargas definidas para este servicio."
          stops={cargas}
          servicio={servicio}
          tx={tx}
          su={su}
          onConfirmMuelle={setConfirmMuelle}
          onStartStopOperation={marcarInicioOperacionStop}
        />

        <CockpitSection title="VIAJE OPERACIONAL">
          <OperativaViajeBlock
            servicio={servicio}
            presentation={presentation}
            tx={tx}
            su={su}
            onOpenViajeModal={onOpenViajeModal}
            onRetryViajePlan={onRetryViajePlan}
            onStartOperationalTrip={onIniciarViajeOperacional}
            viajeOpIniciado={viajeOpIniciado}
            showViajeCta={!planSnapshot}
          />
          {presentation.proximaParadaNormativa && presentation.proximaParadaNormativa !== "—" ? (
            <details style={{ marginTop: 10, background: DRIVER_UI.soft, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 12, padding: "10px 11px" }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: DRIVER_UI.su, fontWeight: 700 }}>Tacógrafo y descansos</summary>
              <div style={{ marginTop: 8, fontSize: 12, color: DRIVER_UI.muted, lineHeight: 1.45 }}>
                {presentation.proximaParadaNormativa}
              </div>
            </details>
          ) : null}
        </CockpitSection>

        <ChronoStopSection
          title="DESCARGAS"
          emptyText="Sin descargas definidas para este servicio."
          stops={descargas}
          servicio={servicio}
          tx={tx}
          su={su}
          onConfirmMuelle={setConfirmMuelle}
          onStartStopOperation={marcarInicioOperacionStop}
        />

        <CockpitSection title="DOCUMENTACIÓN">
          <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 14, padding: "12px 12px" }}>
          <div style={{ fontSize: 15, color: DRIVER_UI.tx, marginBottom: 6 }}>
            <strong style={{ color: DRIVER_UI.blue }}>{sig.docTotal}</strong>{" "}
            <span style={{ color: DRIVER_UI.muted, fontSize: 13 }}>evidencias totales</span>
          </div>
          <div style={{ fontSize: 15, color: DRIVER_UI.tx, marginBottom: 12 }}>
            <strong style={{ color: sig.incidenciasN ? DRIVER_UI.amber : DRIVER_UI.muted }}>{sig.incidenciasN}</strong>{" "}
            <span style={{ color: DRIVER_UI.muted, fontSize: 13 }}>incidencias</span>
          </div>
          {sig.recientes.length ? (
            <div>
              <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 700, marginBottom: 8 }}>Recientes</div>
              {sig.recientes.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    fontSize: 13,
                    color: DRIVER_UI.su,
                    padding: "8px 0",
                    borderBottom: `1px solid ${DRIVER_UI.line}`,
                  }}
                >
                  <span style={{ color: DRIVER_UI.amber, fontWeight: 650 }}>{getDocumentLabel(ev)}</span>
                  <span style={{ color: DRIVER_UI.muted, fontSize: 11, marginLeft: 8 }}>
                    {new Date(ev.created_at).toLocaleString("es-ES", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: DRIVER_UI.muted }}>Sin evidencias registradas.</div>
          )}
          </div>
        </CockpitSection>

        <CockpitSection title="DOCUMENTOS / INCIDENCIAS DE PARADA ACTIVA">
          {(stopMostrar.lat && stopMostrar.lon) || stopMostrar.direccion ? (
            <a
              href={
                stopMostrar.lat
                  ? `https://maps.google.com/maps?daddr=${stopMostrar.lat},${stopMostrar.lon}`
                  : `https://maps.google.com/maps?daddr=${encodeURIComponent(stopMostrar.direccion)}`
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                background: DRIVER_UI.blueSoft,
                color: DRIVER_UI.blue,
                borderRadius: 14,
                padding: "13px",
                fontSize: 14,
                fontWeight: 750,
                textAlign: "center",
                textDecoration: "none",
                marginBottom: 10,
                border: "1px solid #bfdbfe",
              }}
            >
              Navegar a parada activa
            </a>
          ) : null}
          <Ev stopId={stopMostrar.id} showToast={showToast} />
        </CockpitSection>
      </CockpitShell>

      {confirmMuelleDialog}

      <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 750, marginTop: 20, marginBottom: 10, letterSpacing: 0.8 }}>
        TIMELINE SIMPLE
      </div>
      {stops.map((stop) => {
        const esActual = stop.id === stopMostrar.id;
        const icono = stop.estado === "completado" ? "✓" : esActual ? "●" : "○";
        const colorTx = stop.estado === "completado" ? DRIVER_UI.green : esActual ? DRIVER_UI.amber : DRIVER_UI.muted;
        return (
          <div
            key={stop.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "11px 0",
              borderBottom: `1px solid ${DRIVER_UI.line}`,
            }}
          >
            <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{icono}</span>
            <span style={{ fontSize: 14, color: colorTx, fontWeight: esActual ? 700 : 500, flex: 1 }}>
              {stop.orden}. {stop.nombre}
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
              {stop.lat && <span style={{ fontSize: 9, color: DRIVER_UI.green }}>GPS</span>}
              <span style={{ fontSize: 12, color: DRIVER_UI.muted }}>
                {stop.hora_llegada_real
                  ? new Date(stop.hora_llegada_real).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : stop.estado === "pendiente"
                    ? "—"
                    : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
