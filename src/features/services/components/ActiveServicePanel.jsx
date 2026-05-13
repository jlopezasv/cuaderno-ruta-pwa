import { useMemo, useState } from "react";
import { SendDocumentationModal } from "../../mail/SendDocumentationModal";
import { ServiceExtraDocumentsBlock } from "./ServiceExtraDocumentsBlock";
import {
  countServiceDocuments,
} from "../../../domain/service/serviceDocuments";
import { getCurrentStop } from "../../../domain/service/serviceStops";
import { getLastServiceActivity } from "../../../domain/service/serviceActivity";
import { getAttentionReason, needsAttention } from "../../../domain/service/serviceAttention";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "../../../domain/service/serviceOperationalStatus";
import {
  getOperationalPlanConfirmedAt,
  getOperationalPlanSnapshot,
} from "../../../domain/service/serviceOperacionMeta.js";
import { formatOperationalEtaLabel, isRelativeEtaLabel } from "../../../domain/service/etaFormatter.js";
import { getFixedServiceRoute, getServiceClient, getServiceClientReference, getServiceNumber } from "../../../domain/service/serviceIdentity.js";
import { stripOperacionMetaDisplay } from "../../../domain/service/stopOperacionMeta.js";

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
    <section
      style={{
        paddingTop: first ? 0 : 18,
        marginTop: first ? 0 : 18,
        borderTop: first ? "none" : `1px solid ${DRIVER_UI.line}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: DRIVER_UI.muted,
          fontWeight: 800,
          letterSpacing: 0.9,
          marginBottom: 10,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </section>
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

function primaryEtaText(label) {
  const value = String(label || "").trim();
  if (!value || value === "Sin ETA" || value === "…") return "—";
  if (isRelativeEtaLabel(value)) return "—";
  return value;
}

function sortStops(stops) {
  return [...(Array.isArray(stops) ? stops : [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

function stopPlace(stop) {
  return safePlaceName(stop?.nombre, stop?.direccion || `Parada ${stop?.orden ?? ""}`.trim());
}

function stopDocumentSummary(evidencias) {
  const docs = Array.isArray(evidencias) ? evidencias : [];
  const cmr = docs.filter((ev) => ev?.tipo === "cmr").length;
  const fotos = docs.filter((ev) => ev?.tipo === "foto").length;
  const incidencias = docs.filter((ev) => ev?.tipo === "incidencia").length;
  const notas = docs.filter((ev) => ev?.tipo === "nota").length;
  const labels = [];
  if (cmr) labels.push(`${cmr} CMR`);
  if (fotos) labels.push(`${fotos} foto${fotos === 1 ? "" : "s"}`);
  if (incidencias) labels.push(`${incidencias} incidencia${incidencias === 1 ? "" : "s"}`);
  if (notas) labels.push(`${notas} observación${notas === 1 ? "" : "es"}`);
  return {
    total: docs.length,
    cmr,
    fotos,
    incidencias,
    notas,
    label: labels.length ? labels.join(" · ") : "Sin documentos",
  };
}

function extractGoodsSummary(stops, evidenciasByStop) {
  const docs = flattenEvidencias(evidenciasByStop);
  const cmrGoods = docs
    .map((ev) => {
      const parts = [
        ev?.datos?.mercancia,
        ev?.datos?.bultos ? `${ev.datos.bultos} bultos` : "",
        ev?.datos?.peso_kg ? `${ev.datos.peso_kg} kg` : "",
      ].filter(Boolean);
      return parts.join(" · ");
    })
    .filter(Boolean);
  if (cmrGoods.length) return cmrGoods.slice(0, 2).join(" / ");
  return "No indicado";
}

function extractObservations(stops) {
  const notes = sortStops(stops).map((stop) => stripOperacionMetaDisplay(stop.notas)).filter(Boolean);
  return notes.length ? notes.slice(0, 2).join(" / ") : "Sin observaciones";
}

function isStopCompleted(stop) {
  return !!stop?.hora_salida_real || stop?.estado === "completado";
}

function actionButtonStyle(tone) {
  const bg = tone === "amber" ? DRIVER_UI.amber : DRIVER_UI.green;
  return {
    width: "100%",
    background: bg,
    color: "white",
    border: "none",
    borderRadius: 12,
    padding: "12px 13px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function labelForStop(stop, counters) {
  const group = stopOperationalGroup(stop);
  if (group === "carga") return `Carga ${counters.carga}`;
  if (group === "descarga") return `Descarga ${counters.descarga}`;
  if (group === "carga_descarga") return `Carga/descarga ${counters.carga_descarga}`;
  return `Parada ${stop?.orden ?? ""}`.trim();
}

function operationNameForStop(stop) {
  const group = stopOperationalGroup(stop);
  if (group === "carga") return "Carga";
  if (group === "descarga") return "Descarga";
  if (group === "carga_descarga") return "Carga/descarga";
  return "Parada";
}

function buildTimelineItems(stops) {
  const counters = { carga: 0, descarga: 0, carga_descarga: 0, otra: 0 };
  return sortStops(stops).map((stop) => {
    const group = stopOperationalGroup(stop);
    counters[group] = (counters[group] || 0) + 1;
    return { stop, group, label: labelForStop(stop, counters) };
  });
}

function SimpleTimeline({ items, currentStopId }) {
  if (!items.length) {
    return (
      <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 14, padding: "13px", color: DRIVER_UI.muted, fontSize: 13 }}>
        Sin paradas definidas para este servicio.
      </div>
    );
  }

  return (
    <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 14, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const done = isStopCompleted(item.stop);
        const current = item.stop.id === currentStopId && !done;
        const symbol = done ? "✓" : current ? "●" : "○";
        return (
          <div key={item.stop.id} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8, alignItems: "center" }}>
            <span style={{ color: done ? DRIVER_UI.green : current ? DRIVER_UI.amber : "#94a3b8", fontSize: 15, lineHeight: 1 }}>{symbol}</span>
            <span style={{ color: done || current ? DRIVER_UI.tx : DRIVER_UI.su, fontSize: 13, fontWeight: done || current ? 800 : 650, lineHeight: 1.3 }}>
              {item.label} — {stopPlace(item.stop)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DestinationServiceCta({ servicio, onOpenViajeModal }) {
  const plan = getOperationalPlanSnapshot(servicio);
  const planConfirmed = !!getOperationalPlanConfirmedAt(servicio);
  const etaLabel = formatOperationalEtaLabel(plan?.planned_eta) || plan?.planned_eta_label;
  const openRouteModal = () =>
    onOpenViajeModal?.({
      destino: servicio?.destino || "",
      origen: servicio?.origen || "",
      waypoint: planConfirmed ? plan?.input_waypoint || plan?.planned_waypoint || "" : "",
      velocidad: plan?.velocidad || 80,
      gpsOrigen:
        planConfirmed && Number.isFinite(Number(plan?.input_origin_lat)) && Number.isFinite(Number(plan?.input_origin_lon))
          ? { lat: Number(plan.input_origin_lat), lon: Number(plan.input_origin_lon) }
          : null,
      servicioId: servicio?.id,
      origenActual: servicio?.origen || "",
      destinoActual: servicio?.destino || "",
      referenciaActual: servicio?.referencia ?? null,
    });

  return (
    <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 16, padding: "13px 14px" }}>
      <button
        type="button"
        onClick={openRouteModal}
        style={{
          width: "100%",
          background: DRIVER_UI.blue,
          color: "white",
          border: "none",
          borderRadius: 12,
          padding: "12px 13px",
          fontSize: 14,
          fontWeight: 850,
          cursor: "pointer",
        }}
      >
        Añadir destino al servicio
      </button>
      <div style={{ fontSize: 11, color: DRIVER_UI.muted, marginTop: 8, lineHeight: 1.4 }}>
        Recomendado tras la última carga.
        {planConfirmed && etaLabel ? ` ETA confirmada: ${etaLabel}.` : ""}
      </div>
    </div>
  );
}

function OperationalStopCard({
  item,
  isCurrent,
  evidencias,
  canOperate,
  onConfirmMuelle,
  EvidenciasStopComponent,
  showToast,
}) {
  const { stop, label } = item;
  const entrada = !!stop.hora_llegada_real;
  const salida = isStopCompleted(stop);
  const docs = stopDocumentSummary(evidencias);
  const operationName = operationNameForStop(stop);
  const inOperation = entrada && !salida;
  const stateText = salida ? "Completada" : inOperation ? "En operación" : "Pendiente";
  const stateTone = salida
    ? { bg: DRIVER_UI.greenSoft, fg: DRIVER_UI.green }
    : inOperation
      ? { bg: DRIVER_UI.amberSoft, fg: DRIVER_UI.amber }
      : { bg: DRIVER_UI.soft, fg: DRIVER_UI.muted };
  const Ev = EvidenciasStopComponent;

  return (
    <article
      style={{
        background: DRIVER_UI.card,
        border: `1px solid ${isCurrent ? "#fed7aa" : DRIVER_UI.line}`,
        borderRadius: 16,
        padding: "13px 13px 14px",
        boxShadow: isCurrent ? "0 8px 22px rgba(217,119,6,.08)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 850, color: DRIVER_UI.tx, lineHeight: 1.25 }}>
            {salida ? `✓ ${operationName} completada` : inOperation ? `${label} — En operación` : `${label} — ${stopPlace(stop)}`}
          </div>
          {(salida || inOperation) ? <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 4 }}>{stopPlace(stop)}</div> : null}
          {stop.direccion ? <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 4 }}>{stop.direccion}</div> : null}
        </div>
        <span style={{ background: stateTone.bg, color: stateTone.fg, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>
          {stateText}
        </span>
      </div>

      {!entrada ? (
        <div style={{ marginTop: 13 }}>
          {canOperate ? (
            <button type="button" onClick={() => onConfirmMuelle?.({ kind: "entrada", stopId: stop.id })} style={actionButtonStyle("green")}>
              Entrada en muelle
            </button>
          ) : (
            <div style={{ background: DRIVER_UI.soft, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 12, padding: "10px 11px", color: DRIVER_UI.muted, fontSize: 12, fontWeight: 650 }}>
              Pendiente de turno operacional
            </div>
          )}
        </div>
      ) : null}

      {inOperation ? (
        <div style={{ marginTop: 13 }}>
          <div style={{ fontSize: 11, color: DRIVER_UI.muted, fontWeight: 850, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>
            Acciones disponibles
          </div>
          {Ev ? <Ev key={stop.id} stopId={stop.id} showToast={showToast} /> : null}
          <button
            type="button"
            onClick={() => onConfirmMuelle?.({ kind: "salida", stopId: stop.id })}
            disabled={!canOperate}
            style={{
              ...actionButtonStyle("amber"),
              marginTop: 12,
              opacity: canOperate ? 1 : 0.6,
              cursor: canOperate ? "pointer" : "default",
            }}
          >
            {operationName} finalizada
          </button>
        </div>
      ) : null}

      {salida ? (
        <div style={{ marginTop: 13, background: DRIVER_UI.greenSoft, border: "1px solid #bbf7d0", borderRadius: 12, padding: "10px 11px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
            <div>
              <div style={{ color: DRIVER_UI.muted, fontWeight: 800, marginBottom: 3 }}>Entrada</div>
              <div style={{ color: DRIVER_UI.tx, fontWeight: 800, fontFamily: "monospace" }}>{stopTime(stop.hora_llegada_real)}</div>
            </div>
            <div>
              <div style={{ color: DRIVER_UI.muted, fontWeight: 800, marginBottom: 3 }}>Salida</div>
              <div style={{ color: DRIVER_UI.tx, fontWeight: 800, fontFamily: "monospace" }}>{stopTime(stop.hora_salida_real)}</div>
            </div>
          </div>
          <div style={{ color: docs.incidencias ? DRIVER_UI.amber : DRIVER_UI.su, fontSize: 12, fontWeight: 700, marginTop: 8 }}>
            {docs.label}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ServiceSummary({
  serviceNumber,
  conductorNombre,
  etaHeader,
  routeTitle,
  cliente,
  referenciaCliente,
  goods,
  observations,
  attention,
  attentionReason,
  serviceAction,
}) {
  const row = (label, value) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: DRIVER_UI.muted, fontWeight: 800, letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, color: DRIVER_UI.tx, fontWeight: 700, lineHeight: 1.3 }}>{value || "—"}</div>
    </div>
  );

  return (
    <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 16, padding: "15px 14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: etaHeader ? "1fr auto" : "1fr", gap: 12, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 850, color: DRIVER_UI.tx, lineHeight: 1.3 }}>{routeTitle}</div>
          <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 4 }}>Origen → destino</div>
        </div>
        {etaHeader ? (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: DRIVER_UI.tx, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{etaHeader}</div>
            <div style={{ fontSize: 11, color: DRIVER_UI.muted, marginTop: 4 }}>ETA confirmada</div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, marginTop: 16 }}>
        {row("Servicio", serviceNumber)}
        {row("Cliente", cliente)}
        {row("Ref cliente", referenciaCliente)}
        {row("Conductor", conductorNombre)}
        {row("Palets / mercancía", goods)}
        {row("Observaciones", observations)}
      </div>

      {attention ? (
        <div style={{ marginTop: 14, background: DRIVER_UI.amberSoft, border: "1px solid #fed7aa", borderRadius: 12, padding: "10px 11px", color: DRIVER_UI.amber, fontSize: 12, fontWeight: 750, lineHeight: 1.4 }}>
          Atención requerida{attentionReason ? `: ${attentionReason}` : ""}
        </div>
      ) : null}

      {serviceAction ? (
        <button type="button" onClick={serviceAction.onClick} style={{ ...actionButtonStyle("green"), marginTop: 14 }}>
          {serviceAction.label}
        </button>
      ) : null}
    </div>
  );
}

function OperationalStops({ items, currentStopId, evidenciasByStop, canOperate, onConfirmMuelle, EvidenciasStopComponent, showToast }) {
  if (!items.length) {
    return (
      <div style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 14, padding: "13px", color: DRIVER_UI.muted, fontSize: 13 }}>
        Sin paradas definidas para este servicio.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item) => (
        <OperationalStopCard
          key={item.stop.id}
          item={item}
          isCurrent={item.stop.id === currentStopId}
          evidencias={evidenciasByStop?.[item.stop.id]}
          canOperate={canOperate && item.stop.id === currentStopId}
          onConfirmMuelle={onConfirmMuelle}
          EvidenciasStopComponent={EvidenciasStopComponent}
          showToast={showToast}
        />
      ))}
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
  evidenciasByStop,
  showToast,
  onIniciarServicio,
  marcarLlegado,
  marcarCompletado,
  recargar,
  EvidenciasStopComponent,
  onOpenViajeModal,
  conductorNombre = "Conductor",
}) {
  const sig = getCockpitSignals(servicio, stops, evidenciasByStop);
  const [confirmMuelle, setConfirmMuelle] = useState(null);
  const [confirmMuelleSaving, setConfirmMuelleSaving] = useState(false);
  const [sendDocsOpen, setSendDocsOpen] = useState(false);
  const planSnapshot = useMemo(() => getOperationalPlanSnapshot(servicio), [servicio?.referencia]);
  const planConfirmed = !!getOperationalPlanConfirmedAt(servicio);
  const timelineItems = useMemo(() => buildTimelineItems(stops), [stops]);
  const sortedStops = useMemo(() => timelineItems.map((item) => item.stop), [timelineItems]);
  const stopMostrar = getCurrentStop(sortedStops) || sortedStops[0] || null;
  const routeTitle = getFixedServiceRoute(servicio);
  const serviceNumber = getServiceNumber(servicio);
  const cliente = getServiceClient(servicio) || "—";
  const referenciaCliente = getServiceClientReference(servicio) || "—";
  const goods = extractGoodsSummary(sortedStops, evidenciasByStop);
  const observations = extractObservations(sortedStops);
  const etaHeader = planConfirmed ? primaryEtaText(formatOperationalEtaLabel(planSnapshot?.planned_eta) || planSnapshot?.planned_eta_label) : null;
  const canOperateStops = mode !== "asignado" && servicio?.estado === "en_curso";

  const handleConfirmMuelle = async () => {
    if (!confirmMuelle || confirmMuelleSaving) return;
    const { kind, stopId } = confirmMuelle;
    const stop = sortedStops.find((s) => s.id === stopId);
    const operationName = operationNameForStop(stop);
    setConfirmMuelleSaving(true);
    try {
      if (kind === "entrada") {
        await marcarLlegado(stopId);
        await recargar?.();
        showToast?.("Entrada en muelle registrada");
      } else {
        await marcarCompletado(stopId);
        await recargar?.();
        showToast?.(`${operationName} finalizada`);
      }
      setConfirmMuelle(null);
    } catch (error) {
      showToast?.(error?.message || "No se pudo registrar el muelle");
    } finally {
      setConfirmMuelleSaving(false);
    }
  };

  const serviceAction =
    mode === "asignado"
      ? {
          label: "Iniciar servicio",
          onClick: () => onIniciarServicio(servicio.id).then(() => showToast?.("Servicio iniciado")),
        }
      : null;

  const confirmStop = confirmMuelle ? sortedStops.find((s) => s.id === confirmMuelle.stopId) : null;
  const confirmOperationName = operationNameForStop(confirmStop);
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
        <div style={{ fontSize: 16, fontWeight: 800, color: DRIVER_UI.tx, marginBottom: 8 }}>
          {confirmMuelle.kind === "entrada" ? "Confirmar entrada en muelle" : `Confirmar ${confirmOperationName.toLowerCase()} finalizada`}
        </div>
        <div style={{ fontSize: 13, color: DRIVER_UI.su, lineHeight: 1.45, marginBottom: 18 }}>
          {confirmMuelle.kind === "entrada"
            ? "Se registra la hora de entrada y esta parada pasa a estar en operación."
            : `Se registra la hora de salida y ${confirmOperationName.toLowerCase()} queda completada.`}
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
            {confirmMuelleSaving ? "Guardando..." : confirmMuelle.kind === "entrada" ? "Registrar entrada" : `${confirmOperationName} finalizada`}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ padding: "12px 10px 88px", maxWidth: 560, margin: "0 auto", background: DRIVER_UI.bg }}>
      <CockpitShell>
        <CockpitSection title="Resumen del servicio" first>
          <ServiceSummary
            conductorNombre={conductorNombre}
            serviceNumber={serviceNumber}
            etaHeader={etaHeader}
            routeTitle={routeTitle}
            cliente={cliente}
            referenciaCliente={referenciaCliente}
            goods={goods}
            observations={observations}
            attention={sig.attention}
            attentionReason={sig.attentionReason}
            serviceAction={serviceAction}
          />
        </CockpitSection>

        <CockpitSection title="Destino del servicio">
          <DestinationServiceCta servicio={servicio} onOpenViajeModal={onOpenViajeModal} />
        </CockpitSection>

        <CockpitSection title="Documentación del viaje">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ServiceExtraDocumentsBlock servicio={servicio} showToast={showToast} uploaderName={conductorNombre} />
            <button
              type="button"
              onClick={() => setSendDocsOpen(true)}
              style={{
                width: "100%",
                background: DRIVER_UI.soft,
                color: DRIVER_UI.tx,
                border: `1px solid ${DRIVER_UI.line}`,
                borderRadius: 12,
                padding: "12px 13px",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Enviar documentación por correo
            </button>
          </div>
        </CockpitSection>

        <CockpitSection title="Timeline">
          <SimpleTimeline items={timelineItems} currentStopId={stopMostrar?.id} />
        </CockpitSection>

        <CockpitSection title="Acciones operacionales">
          <OperationalStops
            items={timelineItems}
            currentStopId={stopMostrar?.id}
            evidenciasByStop={evidenciasByStop}
            canOperate={canOperateStops}
            onConfirmMuelle={setConfirmMuelle}
            EvidenciasStopComponent={EvidenciasStopComponent}
            showToast={showToast}
          />
        </CockpitSection>

        <CockpitSection title="Tacógrafo">
          <details style={{ background: DRIVER_UI.card, border: `1px solid ${DRIVER_UI.line}`, borderRadius: 14, padding: "10px 12px" }}>
            <summary style={{ cursor: "pointer", color: DRIVER_UI.su, fontSize: 12, fontWeight: 800 }}>
              Normativa y tiempos, secundario
            </summary>
            <div style={{ marginTop: 8, fontSize: 12, color: DRIVER_UI.muted, lineHeight: 1.45 }}>
              El tacógrafo queda fuera del flujo de destino. La operación se gestiona desde cada parada.
            </div>
          </details>
        </CockpitSection>
      </CockpitShell>
      {sendDocsOpen && (
        <SendDocumentationModal
          open
          onClose={() => {
            setSendDocsOpen(false);
            recargar?.();
          }}
          servicio={servicio}
          stops={sortedStops}
          evidenciasByStop={evidenciasByStop}
          showToast={showToast}
        />
      )}
      {confirmMuelleDialog}
    </div>
  );
}
