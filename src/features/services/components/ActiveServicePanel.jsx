import { useMemo, useState } from "react";
import { ServiceExtraDocumentsBlock } from "./ServiceExtraDocumentsBlock";
import { countServiceDocuments } from "../../../domain/service/serviceDocuments";
import { getCurrentStop } from "../../../domain/service/serviceStops";
import { getLastServiceActivity } from "../../../domain/service/serviceActivity";
import { getAttentionReason, needsAttention } from "../../../domain/service/serviceAttention";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "../../../domain/service/serviceOperationalStatus";
import { getOperationalPlanConfirmedAt, getOperationalPlanSnapshot } from "../../../domain/service/serviceOperacionMeta.js";
import { OperationalEtaSnapshotBlock } from "./OperationalEtaSnapshotBlock.jsx";
import {
  getFixedServiceRoute,
  getServiceClient,
  getServiceClientReference,
  getServiceNumberForDisplay,
} from "../../../domain/service/serviceIdentity.js";
import { stripOperacionMetaDisplay } from "../../../domain/service/stopOperacionMeta.js";

/** Claro, operativo — sin estética oscura “gaming” */
const DRIVER_UI = {
  bg: "#eef2f7",
  shell: "#ffffff",
  surface: "#f8fafc",
  surfaceHi: "#f1f5f9",
  tx: "#0f172a",
  su: "#64748b",
  muted: "#94a3b8",
  line: "#e2e8f0",
  green: "#15803d",
  greenSoft: "#dcfce7",
  amber: "#b45309",
  amberSoft: "#fffbeb",
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

function CockpitShell({ children }) {
  return (
    <div
      style={{
        background: DRIVER_UI.shell,
        borderRadius: 18,
        border: `1px solid ${DRIVER_UI.line}`,
        boxShadow: "0 8px 32px rgba(15,23,42,.06)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ padding: "18px 16px 20px" }}>{children}</div>
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

function stopTimelineIcon(group) {
  if (group === "carga") return "📦";
  if (group === "descarga") return "📤";
  if (group === "carga_descarga") return "📦";
  return "📍";
}

function buildTimelineItems(stops) {
  const counters = { carga: 0, descarga: 0, carga_descarga: 0, otra: 0 };
  return sortStops(stops).map((stop) => {
    const group = stopOperationalGroup(stop);
    counters[group] = (counters[group] || 0) + 1;
    return { stop, group, label: labelForStop(stop, counters) };
  });
}

function fmtServiceSchedule(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Hoy ${t}`;
  return d.toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function openOperationalRouteModal(servicio, onOpenViajeModal) {
  const plan = getOperationalPlanSnapshot(servicio);
  const planConfirmed = !!getOperationalPlanConfirmedAt(servicio);
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
}

function ServiceHero({
  routeTitle,
  operationalLabel,
  scheduleLabel,
  serviceNumber,
  attention,
  attentionReason,
  serviceAction,
}) {
  return (
    <header style={{ marginBottom: 2 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 850,
          letterSpacing: -0.45,
          lineHeight: 1.22,
          color: DRIVER_UI.tx,
        }}
      >
        {routeTitle}
      </div>
      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px 10px",
          fontSize: 13,
          color: DRIVER_UI.su,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: DRIVER_UI.green,
              border: "1px solid rgba(21,128,61,.35)",
            }}
          />
          <span style={{ color: DRIVER_UI.tx, fontWeight: 750 }}>{operationalLabel}</span>
        </span>
        {scheduleLabel ? <span style={{ opacity: 0.95 }}>· {scheduleLabel}</span> : null}
      </div>
      {serviceNumber ? (
        <div style={{ marginTop: 8, fontSize: 12, color: DRIVER_UI.muted, fontWeight: 600 }}>{serviceNumber}</div>
      ) : null}
      {attention ? (
        <div
          style={{
            marginTop: 12,
            background: DRIVER_UI.amberSoft,
            border: "1px solid #fcd34d",
            borderRadius: 12,
            padding: "10px 11px",
            color: DRIVER_UI.amber,
            fontSize: 12,
            fontWeight: 750,
            lineHeight: 1.45,
          }}
        >
          Atención{attentionReason ? `: ${attentionReason}` : ""}
        </div>
      ) : null}
      {serviceAction ? (
        <button type="button" onClick={serviceAction.onClick} style={{ ...actionButtonStyle("green"), marginTop: 14 }}>
          {serviceAction.label}
        </button>
      ) : null}
    </header>
  );
}

function ServiceDetailsCollapsible({ cliente, referenciaCliente, conductorNombre, goods, observations }) {
  return (
    <details
      className="svc-details-coll"
      style={{
        marginTop: 14,
        borderRadius: 12,
        border: `1px solid ${DRIVER_UI.line}`,
        background: DRIVER_UI.surface,
        padding: "0 12px 4px",
      }}
    >
      <style>{`
        .svc-details-coll > summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          list-style: none;
          font-size: 13px;
          font-weight: 650;
          color: ${DRIVER_UI.tx};
          padding: 12px 0 11px;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .svc-details-coll > summary::-webkit-details-marker { display: none; }
        .svc-details-coll > summary::marker { content: ""; }
        .svc-details-coll .svc-chev {
          flex-shrink: 0;
          font-size: 11px;
          color: ${DRIVER_UI.muted};
          font-weight: 700;
          letter-spacing: 0.02em;
          transition: transform 0.18s ease;
        }
        .svc-details-coll[open] .svc-chev { transform: rotate(180deg); }
      `}</style>
      <summary>
        <span>Cliente, referencias y observaciones</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 650, color: DRIVER_UI.muted }}>Ver más</span>
          <span className="svc-chev" aria-hidden>
            ▼
          </span>
        </span>
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12, fontSize: 13, color: DRIVER_UI.tx, borderTop: `1px solid ${DRIVER_UI.line}`, paddingTop: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: DRIVER_UI.muted, fontWeight: 800, marginBottom: 3 }}>Cliente</div>
          <div style={{ fontWeight: 650, lineHeight: 1.35 }}>{cliente || "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: DRIVER_UI.muted, fontWeight: 800, marginBottom: 3 }}>Ref. cliente</div>
          <div style={{ fontWeight: 650, lineHeight: 1.35 }}>{referenciaCliente || "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: DRIVER_UI.muted, fontWeight: 800, marginBottom: 3 }}>Conductor</div>
          <div style={{ fontWeight: 650 }}>{conductorNombre}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: DRIVER_UI.muted, fontWeight: 800, marginBottom: 3 }}>Mercancía / bultos</div>
          <div style={{ fontWeight: 650, lineHeight: 1.35, color: DRIVER_UI.su }}>{goods}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: DRIVER_UI.muted, fontWeight: 800, marginBottom: 3 }}>Observaciones</div>
          <div style={{ fontWeight: 650, lineHeight: 1.35, color: DRIVER_UI.su }}>{observations}</div>
        </div>
      </div>
    </details>
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
  servicio,
  servicioId,
  conductorNombre,
  onEvidenciaSaved,
}) {
  const { stop, label, group } = item;
  const entrada = !!stop.hora_llegada_real;
  const salida = isStopCompleted(stop);
  const docs = stopDocumentSummary(evidencias);
  const operationName = operationNameForStop(stop);
  const inOperation = entrada && !salida;
  const stateText = salida ? "Hecho" : inOperation ? "En planta" : "Pendiente";
  const stateTone = salida
    ? { bg: DRIVER_UI.greenSoft, fg: DRIVER_UI.green }
    : inOperation
      ? { bg: DRIVER_UI.amberSoft, fg: DRIVER_UI.amber }
      : { bg: DRIVER_UI.surfaceHi, fg: DRIVER_UI.su };
  const Ev = EvidenciasStopComponent;
  const icon = stopTimelineIcon(group);

  return (
    <article
      id={`stop-ops-${stop.id}`}
      style={{
        position: "relative",
        background: isCurrent ? "#fffbeb" : DRIVER_UI.shell,
        border: `1px solid ${isCurrent ? "#fcd34d" : DRIVER_UI.line}`,
        borderRadius: 16,
        padding: "12px 12px 13px 14px",
        boxShadow: isCurrent ? "0 4px 18px rgba(180,83,9,.08)" : "0 1px 2px rgba(15,23,42,.04)",
      }}
    >
      {isCurrent ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: "0 4px 4px 0",
            background: DRIVER_UI.amber,
          }}
        />
      ) : null}
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: DRIVER_UI.surfaceHi,
            border: `1px solid ${DRIVER_UI.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: DRIVER_UI.tx, lineHeight: 1.25 }}>
                {salida ? `${operationName} · completada` : inOperation ? `${label}` : `${label}`}
              </div>
              <div style={{ fontSize: 13, color: DRIVER_UI.su, marginTop: 3, fontWeight: 650, lineHeight: 1.35 }}>
                {stopPlace(stop)}
              </div>
              {stop.direccion && stop.direccion !== stop.nombre ? (
                <div style={{ fontSize: 12, color: DRIVER_UI.muted, marginTop: 3 }}>{stop.direccion}</div>
              ) : null}
            </div>
            <span
              style={{
                background: stateTone.bg,
                color: stateTone.fg,
                borderRadius: 999,
                padding: "4px 9px",
                fontSize: 10,
                fontWeight: 800,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {stateText}
            </span>
          </div>

          {!entrada ? (
            <div style={{ marginTop: 12 }}>
              {canOperate ? (
                <button type="button" onClick={() => onConfirmMuelle?.({ kind: "entrada", stopId: stop.id })} style={actionButtonStyle("green")}>
                  Entrada en muelle
                </button>
              ) : (
                <div
                  style={{
                    background: DRIVER_UI.surfaceHi,
                    borderRadius: 11,
                    padding: "10px 11px",
                    color: DRIVER_UI.su,
                    fontSize: 12,
                    fontWeight: 650,
                    border: `1px solid ${DRIVER_UI.line}`,
                  }}
                >
                  Pendiente de turno operacional
                </div>
              )}
            </div>
          ) : null}

          {inOperation ? (
            <div style={{ marginTop: 12 }}>
              {Ev ? (
                <Ev
                  key={stop.id}
                  stopId={stop.id}
                  servicioId={servicioId}
                  servicio={servicio}
                  stop={stop}
                  conductorName={conductorNombre}
                  conductorId={servicio?.conductor_id}
                  showToast={showToast}
                  onEvidenciaSaved={onEvidenciaSaved}
                />
              ) : null}
              <button
                type="button"
                onClick={() => onConfirmMuelle?.({ kind: "salida", stopId: stop.id })}
                disabled={!canOperate}
                style={{
                  ...actionButtonStyle("amber"),
                  marginTop: 12,
                  opacity: canOperate ? 1 : 0.55,
                  cursor: canOperate ? "pointer" : "default",
                }}
              >
                {operationName} finalizada
              </button>
            </div>
          ) : null}

          {salida ? (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${DRIVER_UI.line}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ color: DRIVER_UI.muted, fontWeight: 750, marginBottom: 3 }}>Entrada</div>
                  <div style={{ color: DRIVER_UI.tx, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{stopTime(stop.hora_llegada_real)}</div>
                </div>
                <div>
                  <div style={{ color: DRIVER_UI.muted, fontWeight: 750, marginBottom: 3 }}>Salida</div>
                  <div style={{ color: DRIVER_UI.tx, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{stopTime(stop.hora_salida_real)}</div>
                </div>
              </div>
              {docs.total > 0 ? (
                <div style={{ color: docs.incidencias ? DRIVER_UI.amber : DRIVER_UI.su, fontSize: 12, fontWeight: 700, marginTop: 8 }}>{docs.label}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function OperationalStops({
  items,
  currentStopId,
  evidenciasByStop,
  canOperate,
  onConfirmMuelle,
  EvidenciasStopComponent,
  showToast,
  servicio,
  servicioId,
  conductorNombre,
  onEvidenciaSaved,
}) {
  if (!items.length) {
    return (
      <div style={{ borderRadius: 14, padding: "14px", color: DRIVER_UI.su, fontSize: 13, border: `1px dashed ${DRIVER_UI.line}` }}>
        Sin paradas definidas para este servicio.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, idx) => (
        <div key={item.stop.id} style={{ position: "relative" }}>
          {idx > 0 ? (
            <div
              style={{
                position: "absolute",
                left: 19,
                top: -10,
                width: 2,
                height: 10,
                background: "linear-gradient(180deg, rgba(148,163,184,.35), rgba(148,163,184,.12))",
                borderRadius: 1,
              }}
            />
          ) : null}
          <OperationalStopCard
            item={item}
            isCurrent={item.stop.id === currentStopId}
            evidencias={evidenciasByStop?.[item.stop.id]}
            canOperate={canOperate && item.stop.id === currentStopId}
            onConfirmMuelle={onConfirmMuelle}
            EvidenciasStopComponent={EvidenciasStopComponent}
            showToast={showToast}
            servicio={servicio}
            servicioId={servicioId}
            conductorNombre={conductorNombre}
            onEvidenciaSaved={onEvidenciaSaved}
          />
        </div>
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
  onEvidenciaSaved,
  conductorNombre = "Conductor",
  norma = null,
}) {
  const sig = getCockpitSignals(servicio, stops, evidenciasByStop);
  const [confirmMuelle, setConfirmMuelle] = useState(null);
  const [confirmMuelleSaving, setConfirmMuelleSaving] = useState(false);
  const timelineItems = useMemo(() => buildTimelineItems(stops), [stops]);
  const sortedStops = useMemo(() => timelineItems.map((item) => item.stop), [timelineItems]);
  const stopMostrar = getCurrentStop(sortedStops) || sortedStops[0] || null;
  const tacografoEstado = useMemo(() => {
    if (!norma) return null;
    return {
      isDriving: !!norma.isDriving,
      crType: norma.crType ?? "",
      crDur: Number(norma.crDur),
    };
  }, [norma]);
  const routeTitle = getFixedServiceRoute(servicio, "Origen", "Destino", sortedStops);
  const serviceNumber = getServiceNumberForDisplay(servicio);
  const cliente = getServiceClient(servicio) || "—";
  const referenciaCliente = getServiceClientReference(servicio) || "—";
  const goods = extractGoodsSummary(sortedStops, evidenciasByStop);
  const observations = extractObservations(sortedStops);
  const canOperateStops = mode !== "asignado" && servicio?.estado === "en_curso";
  const scheduleLabel = fmtServiceSchedule(servicio?.fecha_inicio);
  const activeTimelineItem = timelineItems.find((it) => it.stop.id === stopMostrar?.id);

  const handleConfirmMuelle = async () => {
    if (!confirmMuelle || confirmMuelleSaving) return;
    const { kind, stopId } = confirmMuelle;
    setConfirmMuelleSaving(true);
    try {
      if (kind === "entrada") {
        await marcarLlegado(stopId);
        await recargar?.();
      } else {
        await marcarCompletado(stopId);
        await recargar?.();
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
          onClick: () => onIniciarServicio(servicio.id),
        }
      : null;

  const confirmStop = confirmMuelle ? sortedStops.find((s) => s.id === confirmMuelle.stopId) : null;
  const confirmOperationName = operationNameForStop(confirmStop);
  const confirmMuelleDialog = confirmMuelle ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.4)",
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
          background: "#ffffff",
          borderRadius: 18,
          padding: "20px 18px",
          maxWidth: 400,
          width: "100%",
          border: `1px solid ${DRIVER_UI.line}`,
          boxShadow: "0 20px 50px rgba(15,23,42,.12)",
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
              background: DRIVER_UI.surfaceHi,
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
    <div style={{ padding: "10px 12px 88px", maxWidth: 560, margin: "0 auto", background: DRIVER_UI.bg, minHeight: "70vh" }}>
      <CockpitShell>
        <ServiceHero
          routeTitle={routeTitle}
          operationalLabel={sig.operationalMeta.label}
          scheduleLabel={scheduleLabel}
          serviceNumber={serviceNumber}
          attention={sig.attention}
          attentionReason={sig.attentionReason}
          serviceAction={serviceAction}
        />

        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: "12px 14px",
            borderRadius: 12,
            border: `1px solid ${DRIVER_UI.line}`,
            background: DRIVER_UI.surface,
          }}
        >
          <OperationalEtaSnapshotBlock
            servicio={servicio}
            nowMs={Date.now()}
            tx={DRIVER_UI.tx}
            su={DRIVER_UI.su}
            subtle={DRIVER_UI.muted}
            latestLocation={null}
            tacografoEstado={tacografoEstado}
            activeStop={stopMostrar}
          />
        </div>

        <ServiceDetailsCollapsible
          cliente={cliente}
          referenciaCliente={referenciaCliente}
          conductorNombre={conductorNombre}
          goods={goods}
          observations={observations}
        />

        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 850, color: DRIVER_UI.tx, letterSpacing: -0.2 }}>Recorrido</div>
            {activeTimelineItem ? (
              <div style={{ fontSize: 11, color: DRIVER_UI.su, fontWeight: 700, textAlign: "right" }}>
                Parada activa · {activeTimelineItem.label}
              </div>
            ) : null}
          </div>
          <OperationalStops
            items={timelineItems}
            currentStopId={stopMostrar?.id}
            evidenciasByStop={evidenciasByStop}
            canOperate={canOperateStops}
            onConfirmMuelle={setConfirmMuelle}
            EvidenciasStopComponent={EvidenciasStopComponent}
            showToast={showToast}
            servicio={servicio}
            servicioId={servicio?.id}
            conductorNombre={conductorNombre}
            onEvidenciaSaved={onEvidenciaSaved}
          />
        </div>

        <div style={{ marginTop: 20 }}>
          <ServiceExtraDocumentsBlock servicio={servicio} showToast={showToast} uploaderName={conductorNombre} tone="light" compact />
        </div>
        {servicio && typeof onOpenViajeModal === "function" ? (
          <button
            type="button"
            title="Ruta, destino y ETA"
            aria-label="Ajustar ruta o destino"
            onClick={() => openOperationalRouteModal(servicio, onOpenViajeModal)}
            style={{
              marginTop: 14,
              width: "100%",
              minHeight: 46,
              padding: "11px 14px",
              borderRadius: 12,
              border: `1px dashed ${DRIVER_UI.line}`,
              background: DRIVER_UI.surfaceHi,
              color: DRIVER_UI.su,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🗺 Ajustar ruta o destino
          </button>
        ) : null}
      </CockpitShell>
      {confirmMuelleDialog}
    </div>
  );
}
