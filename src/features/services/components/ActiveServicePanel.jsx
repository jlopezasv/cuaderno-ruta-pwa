import { useEffect, useMemo, useRef, useState } from "react";
import { ServiceExtraDocumentsBlock } from "./ServiceExtraDocumentsBlock";
import { ServiceEmpresaDocumentsBlock } from "./ServiceEmpresaDocumentsBlock.jsx";
import { countServiceDocuments } from "../../../domain/service/serviceDocuments";
import { resolveExpandedStopId } from "../../../domain/service/serviceStops";
import {
  buildDriverStopTimesRows,
  primaryMuelleActionLabel,
} from "./driverStopOperationalDisplay.js";
import { getLastServiceActivity } from "../../../domain/service/serviceActivity";
import { getAttentionReason, needsAttention } from "../../../domain/service/serviceAttention";
import { getOperationalStatus, OPERATIONAL_STATUS_META } from "../../../domain/service/serviceOperationalStatus";
import { getOperationalPlanConfirmedAt, getOperationalPlanSnapshot } from "../../../domain/service/serviceOperacionMeta.js";
import { getOperationalRouteStartedAt } from "../../../domain/service/serviceOperacionMeta.js";
import { hasActiveRouteDestination } from "../../../domain/service/operationalEtaPresentation.js";
import { EtaPrevistaBlock } from "./EtaPrevistaBlock.jsx";
import {
  getFixedServiceRoute,
  getServiceClient,
  getServiceClientReference,
  getServiceNumberForDisplay,
} from "../../../domain/service/serviceIdentity.js";
import { getServiceOperationalPresentation } from "../../../domain/service/serviceOperationalPlaces.js";
import {
  formatStopNotesForDisplay,
  getStopOperacionMeta,
} from "../../../domain/service/stopOperacionMeta.js";
import { needsExpedienteClosure } from "../../../domain/service/expedienteCierre.js";
import { ExpedienteClosureBlock } from "./ExpedienteClosureBlock.jsx";
import { SiguienteServicioAccordion, SiguienteServicioEmpty } from "./SiguienteServicioAccordion.jsx";
import { ServiceOriginBadge } from "../../../ui/ServiceOriginBadge.jsx";
import { EnRutaHastaProximaEntrada } from "./EnRutaHastaProximaEntrada.jsx";
import { ParticipacionTiemposPanel } from "./ParticipacionTiemposPanel.jsx";
import { formatOperationalEtaLabel } from "../../../domain/service/etaFormatter.js";
import { getEtaPrevista } from "../../../domain/service/etaPrevista.js";
import { ConductorDcdtPanel } from "../../dcdt/ConductorDcdtPanel.jsx";
import { DriverLocationGateModal } from "./DriverLocationGateModal.jsx";
import { useDriverActionLocation } from "../hooks/useDriverActionLocation.js";
import { logMuelleGps } from "../../../data/muelleGeoTrace.js";

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

/** Ancho máximo del panel tab Servicio (conductor). */
const DRIVER_PANEL_MAX_WIDTH = 720;

/** Demo conductor — servicio (solo presentación) */
const DEMO_UI = {
  page: "#F4F3F0",
  section: "#ffffff",
  tx: "#1c1917",
  su: "#57534e",
  muted: "#a8a29e",
  line: "rgba(28,25,23,.12)",
  green: "#1A7A4A",
  greenDot: "#1A7A4A",
  amber: "#b45309",
  amberSoft: "#fef9c3",
  amberBorder: "#fde047",
  blue: "#0F5FA8",
  carga: "#ea580c",
  cargaSoft: "#fff7ed",
  descarga: "#15803d",
  descargaSoft: "#ecfdf5",
  avatarBlue: "#dbeafe",
  avatarBlueTx: "#1d4ed8",
  avatarGreen: "#dcfce7",
  avatarGreenTx: "#166534",
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

/** Líneas de recorrido: empresa, lugar, dirección y detalles libres (sin metadatos operativos). */
function getStopRecorridoLines(stop) {
  const meta = getStopOperacionMeta(stop?.notas);
  const empresa =
    String(stop?.empresa || "").trim() ||
    String(meta.empresa_logistica || meta.empresa || "").trim();
  const ciudad = safePlaceName(stop?.nombre, "");
  const cp = String(meta.codigo_postal || stop?.codigo_postal || "").trim();
  const pais = String(meta.pais || stop?.pais || "").trim();
  const provincia = String(meta.provincia || stop?.provincia || "").trim();
  const lugarParts = [ciudad, cp ? `CP ${cp}` : "", provincia, pais].filter(Boolean);
  const lugar = lugarParts.join(" · ") || ciudad;
  const dirRaw = String(stop?.direccion || "").trim();
  const direccion =
    dirRaw && dirRaw.localeCompare(ciudad, undefined, { sensitivity: "accent" }) !== 0 ? dirRaw : "";
  const detalles = formatStopNotesForDisplay(stop?.notas);
  return { empresa, lugar, direccion, detalles };
}

function StopRecorridoInfoLines({ stop, tone = "legacy" }) {
  const { empresa, lugar, direccion, detalles } = getStopRecorridoLines(stop);
  const isDemo = tone === "demo";
  const bodyColor = isDemo ? DEMO_UI.tx : DRIVER_UI.tx;
  const midColor = isDemo ? DEMO_UI.su : DRIVER_UI.su;
  const mutedColor = isDemo ? DEMO_UI.muted : DRIVER_UI.muted;
  const detailColor = isDemo ? DEMO_UI.su : DRIVER_UI.muted;
  const hasBody = empresa || lugar || direccion || detalles;
  if (!hasBody) return null;

  return (
    <div style={{ marginTop: isDemo ? 2 : 3 }}>
      {empresa ? (
        <div
          style={{
            fontSize: isDemo ? 14 : 13,
            color: bodyColor,
            marginTop: 2,
            lineHeight: 1.35,
            fontWeight: isDemo ? 600 : 700,
          }}
        >
          {empresa}
        </div>
      ) : null}
      {lugar ? (
        <div style={{ fontSize: isDemo ? 14 : 13, color: midColor, marginTop: 2, lineHeight: 1.35 }}>{lugar}</div>
      ) : null}
      {direccion ? (
        <div style={{ fontSize: isDemo ? 13 : 12, color: mutedColor, marginTop: 2, lineHeight: 1.3 }}>{direccion}</div>
      ) : null}
      {detalles ? (
        <div
          style={{
            fontSize: 12,
            color: detailColor,
            marginTop: 4,
            lineHeight: 1.45,
            fontWeight: 500,
          }}
        >
          {detalles}
        </div>
      ) : null}
    </div>
  );
}

function stopDocumentSummary(evidencias) {
  const docs = Array.isArray(evidencias) ? evidencias : [];
  const cmr = docs.filter((ev) => ev?.tipo === "cmr").length;
  const fotos = docs.filter((ev) => ev?.tipo === "foto").length;
  const incidencias = docs.filter((ev) => ev?.tipo === "incidencia" || ev?.incidencia_id).length;
  const labels = [];
  if (cmr) labels.push(`${cmr} documento${cmr === 1 ? "" : "s"}`);
  if (fotos) labels.push(`${fotos} foto${fotos === 1 ? "" : "s"}`);
  if (incidencias) labels.push(`${incidencias} incidencia${incidencias === 1 ? "" : "s"}`);
  return {
    total: docs.length,
    cmr,
    fotos,
    incidencias,
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
  const notes = sortStops(stops).map((stop) => formatStopNotesForDisplay(stop.notas)).filter(Boolean);
  return notes.length ? notes.slice(0, 2).join(" / ") : "";
}

function hasServiceDetailsContent({ cliente, referenciaCliente, goods, observations }) {
  if (cliente && cliente !== "—") return true;
  if (referenciaCliente && referenciaCliente !== "—") return true;
  if (goods && goods !== "No indicado") return true;
  if (observations) return true;
  return false;
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

function finishActionLabelForStop(stop) {
  return primaryMuelleActionLabel(stop, "salida");
}

function muellePrimaryBtnStyle(tone) {
  const bg = tone === "amber" ? DRIVER_UI.amber : DRIVER_UI.green;
  return {
    width: "100%",
    minHeight: 52,
    background: bg,
    color: "#ffffff",
    border: "none",
    borderRadius: 12,
    padding: "14px 16px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(15,23,42,.1)",
  };
}

function routeSecondaryBtnStyle(isDemo) {
  return isDemo
    ? {
        width: "100%",
        minHeight: 40,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${DEMO_UI.line}`,
        background: DEMO_UI.section,
        color: DEMO_UI.su,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }
    : {
        width: "100%",
        minHeight: 40,
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${DRIVER_UI.line}`,
        background: DRIVER_UI.surface,
        color: DRIVER_UI.su,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      };
}

function muelleActionMeta(kind, stop) {
  const tipo = String(stop?.tipo || "").toLowerCase();
  if (kind === "entrada") {
    return { eventType: "entrada_muelle", actionLabel: "entrada en muelle" };
  }
  if (tipo === "descarga") {
    return { eventType: "completar_descarga", actionLabel: "completar descarga" };
  }
  if (tipo === "carga") {
    return { eventType: "completar_carga", actionLabel: "completar carga" };
  }
  return { eventType: "salida_muelle", actionLabel: "salida de muelle" };
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

/** Una fila: iniciar ruta o «Ruta iniciada» + Recalcular (misma altura que botón único). */
function DriverOperationalRouteNav({
  servicio,
  onOpenRoute,
  onStartRoute,
  onRecalculateRoute,
  showToast,
  variant = "demo",
  emphasis = "secondary",
}) {
  const routeConfigured = hasActiveRouteDestination(servicio);
  const routeStartedByDriver = !!getOperationalRouteStartedAt(servicio);
  const routeActive = routeStartedByDriver;
  const [recalculating, setRecalculating] = useState(false);
  const isDemo = variant === "demo";
  const isSecondary = emphasis === "secondary";
  const minH = isSecondary ? 40 : 46;
  const rowGap = 8;

  async function handleRecalculate() {
    if (!onRecalculateRoute || recalculating) return;
    setRecalculating(true);
    try {
      await onRecalculateRoute(servicio);
    } catch (e) {
      showToast?.(e?.message || "No se pudo recalcular la ruta");
    } finally {
      setRecalculating(false);
    }
  }

  const handleOpenRoute = async () => {
    try {
      if (!routeStartedByDriver) {
        await onStartRoute?.();
      }
    } catch (e) {
      showToast?.(e?.message || "No se pudo iniciar la ruta");
    }
    onOpenRoute?.();
  };

  if (!routeActive) {
    const soloStyle = isSecondary
      ? routeSecondaryBtnStyle(isDemo)
      : isDemo
        ? demoPrimaryBtn(DEMO_UI.blue)
        : {
            width: "100%",
            minHeight: minH,
            padding: "11px 14px",
            borderRadius: 12,
            border: "none",
            background: DRIVER_UI.blue,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          };
    return (
      <button
        type="button"
        title="Ruta, destino y ETA"
        aria-label="Iniciar ruta hasta destino"
        onClick={() => void handleOpenRoute()}
        style={soloStyle}
      >
        Iniciar ruta
      </button>
    );
  }

  const primaryFlex = isSecondary ? "1 1 62%" : "1 1 74%";
  const secondaryFlex = isSecondary ? "1 1 38%" : "1 1 26%";
  const primaryStyle = isSecondary
    ? {
        ...routeSecondaryBtnStyle(isDemo),
        flex: primaryFlex,
        minWidth: 0,
        width: "auto",
        minHeight: minH,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }
    : isDemo
      ? {
          flex: primaryFlex,
          minWidth: 0,
          minHeight: minH,
          padding: "11px 10px",
          borderRadius: 8,
          border: "none",
          background: DEMO_UI.blue,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }
      : {
          flex: primaryFlex,
          minWidth: 0,
          minHeight: minH,
          padding: "11px 10px",
          borderRadius: 12,
          border: "none",
          background: DRIVER_UI.blue,
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        };
  const secondaryStyle = isDemo
    ? {
        flex: secondaryFlex,
        minWidth: 0,
        minHeight: minH,
        padding: "11px 6px",
        borderRadius: 8,
        border: `1px solid ${DEMO_UI.line}`,
        background: DEMO_UI.section,
        color: DEMO_UI.tx,
        fontSize: 11,
        fontWeight: 600,
        cursor: recalculating ? "default" : "pointer",
        opacity: recalculating ? 0.65 : 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }
    : {
        flex: secondaryFlex,
        minWidth: 0,
        minHeight: minH,
        padding: "11px 6px",
        borderRadius: 12,
        border: `1px solid ${DRIVER_UI.line}`,
        background: DRIVER_UI.surface,
        color: DRIVER_UI.tx,
        fontSize: 11,
        fontWeight: 700,
        cursor: recalculating ? "default" : "pointer",
        opacity: recalculating ? 0.65 : 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      };

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: rowGap, width: "100%" }}>
      <button
        type="button"
        title="Ver ruta y navegación activa"
        aria-label={routeActive ? "Ruta iniciada" : "Iniciar ruta"}
        onClick={() => void handleOpenRoute()}
        style={primaryStyle}
      >
        {routeActive ? "✓ Ruta iniciada" : "Iniciar ruta"}
      </button>
      <button
        type="button"
        title="Recalcular ruta desde tu ubicación actual"
        aria-label="Recalcular ruta"
        disabled={recalculating || !onRecalculateRoute}
        onClick={() => void handleRecalculate()}
        style={secondaryStyle}
      >
        {recalculating ? "…" : "Recalcular"}
      </button>
    </div>
  );
}

function ServiceHero({
  clienteNombre,
  routeLine,
  operationalLabel,
  scheduleLabel,
  serviceNumber,
  attention,
  attentionReason,
  serviceAction,
}) {
  return (
    <header style={{ marginBottom: 2 }}>
      {clienteNombre ? (
        <div
          style={{
            fontSize: 22,
            fontWeight: 850,
            letterSpacing: -0.45,
            lineHeight: 1.22,
            color: DRIVER_UI.tx,
          }}
        >
          {clienteNombre}
        </div>
      ) : null}
      <div
        style={{
          fontSize: clienteNombre ? 16 : 22,
          fontWeight: clienteNombre ? 700 : 850,
          letterSpacing: clienteNombre ? -0.2 : -0.45,
          lineHeight: 1.28,
          color: clienteNombre ? DRIVER_UI.su : DRIVER_UI.tx,
          marginTop: clienteNombre ? 6 : 0,
        }}
      >
        {routeLine}
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
        {observations ? (
          <div>
            <div style={{ fontSize: 10, color: DRIVER_UI.muted, fontWeight: 800, marginBottom: 3 }}>Observaciones</div>
            <div style={{ fontWeight: 650, lineHeight: 1.35, color: DRIVER_UI.su }}>{observations}</div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function demoRowDivider() {
  return { borderBottom: `0.5px solid ${DEMO_UI.line}` };
}

function demoPrimaryBtn(bg) {
  return {
    width: "100%",
    background: bg,
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "14px 16px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  };
}

function DriverDemoSection({ children, title, style = {} }) {
  return (
    <section
      style={{
        background: DEMO_UI.section,
        padding: title ? "14px 16px 16px" : "14px 16px",
        ...style,
      }}
    >
      {title ? (
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: 13,
            fontWeight: 600,
            color: DEMO_UI.tx,
            letterSpacing: 0,
          }}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function DriverServiceHeader({ servicio, empresaById, serviceNumber, scheduleLabel }) {
  return (
    <div>
      <ServiceOriginBadge
        servicio={servicio}
        empresaById={empresaById}
        size="sm"
        truncate={false}
        style={{
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0,
          maxWidth: "100%",
          width: "100%",
        }}
      />
      <div style={{ marginTop: 8, fontSize: 13, color: DEMO_UI.su, lineHeight: 1.35 }}>
        {serviceNumber ? <span style={{ fontWeight: 500, color: DEMO_UI.tx }}>{serviceNumber}</span> : null}
        {serviceNumber && scheduleLabel ? <span> · </span> : null}
        {scheduleLabel ? <span>{scheduleLabel}</span> : null}
        {!serviceNumber && !scheduleLabel ? <span>Servicio</span> : null}
      </div>
    </div>
  );
}

function DriverRouteHeroLine({ origen, destino, routeLine }) {
  const left = safePlaceName(origen, "Origen");
  const right = safePlaceName(destino, "Destino");
  const fallback = routeLine && routeLine !== "— → —" ? routeLine.split("→").map((s) => s.trim()) : null;
  const from = left !== "Origen" ? left : fallback?.[0] || "Origen";
  const to = right !== "Destino" ? right : fallback?.[1] || "Destino";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        fontSize: 16,
        fontWeight: 500,
        color: DEMO_UI.tx,
        lineHeight: 1.3,
      }}
    >
      <span style={{ flexShrink: 0, maxWidth: "38%" }}>{from}</span>
      <div
        style={{
          flex: 1,
          minWidth: 24,
          display: "flex",
          alignItems: "center",
          gap: 4,
          color: DEMO_UI.muted,
        }}
        aria-hidden
      >
        <div style={{ flex: 1, borderTop: `1px dashed ${DEMO_UI.muted}` }} />
        <span style={{ fontSize: 14, flexShrink: 0 }}>→</span>
        <div style={{ flex: 1, borderTop: `1px dashed ${DEMO_UI.muted}` }} />
      </div>
      <span style={{ flexShrink: 0, maxWidth: "38%", textAlign: "right" }}>{to}</span>
    </div>
  );
}

function DriverTripHero({
  conductorNombre,
  origen,
  destino,
  routeLine,
  servicioNoIniciado,
  totalParticipantes,
}) {
  const statusLabel = servicioNoIniciado ? "Esperando inicio" : "Operativo";
  const dotColor = servicioNoIniciado ? DEMO_UI.amber : DEMO_UI.greenDot;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: DEMO_UI.tx, lineHeight: 1.22 }}>{conductorNombre}</div>
          <DriverRouteHeroLine origen={origen} destino={destino} routeLine={routeLine} />
          <div
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: DEMO_UI.tx,
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: dotColor,
                flexShrink: 0,
              }}
            />
            <span style={{ color: servicioNoIniciado ? DEMO_UI.amber : DEMO_UI.green }}>{statusLabel}</span>
          </div>
        </div>
        {Number(totalParticipantes) > 1 ? (
          <div style={{ fontSize: 11, color: DEMO_UI.su, fontWeight: 500, textAlign: "right", flexShrink: 0, paddingTop: 4 }}>
            {totalParticipantes} conductores
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DriverAlertNotStarted() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        background: DEMO_UI.amberSoft,
        border: `1px solid ${DEMO_UI.amberBorder}`,
        borderRadius: 4,
        padding: "10px 12px",
        fontSize: 13,
        color: DEMO_UI.amber,
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
        ⚠
      </span>
      <span>Atención: servicio sin iniciar</span>
    </div>
  );
}

function stopCompactBadge(stop) {
  const entrada = !!stop.hora_llegada_real;
  const salida = isStopCompleted(stop);
  const inOperation = entrada && !salida;
  const stateText = salida ? "Completada" : inOperation ? "En muelle" : "Pendiente";
  const fg = salida ? DEMO_UI.descarga : inOperation ? DEMO_UI.amber : DEMO_UI.su;
  const bg = salida ? DEMO_UI.descargaSoft : inOperation ? DEMO_UI.amberSoft : "#f5f5f4";
  return { stateText, fg, bg };
}

function stopCompletedSummary(item) {
  const { stop, group } = item;
  if (!isStopCompleted(stop)) return null;
  const op =
    group === "carga" ? "Carga" : group === "descarga" ? "Descarga" : operationNameForStop(stop);
  return `✓ ${op} completada · ${stopTime(stop.hora_salida_real)}`;
}

function StopTimesBlock({ stop, isFirstCarga, servicio }) {
  const rows = buildDriverStopTimesRows({ stop, isFirstCarga, servicio });
  if (!rows.length) return null;
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: DRIVER_UI.surfaceHi,
        border: `1px solid ${DRIVER_UI.line}`,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: DRIVER_UI.muted, letterSpacing: 0.4, marginBottom: 8 }}>
        TIEMPOS REGISTRADOS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}
          >
            <span style={{ color: DRIVER_UI.su, fontWeight: 650 }}>{row.label}</span>
            <span
              style={{
                color:
                  row.kind === "geo"
                    ? DRIVER_UI.su
                    : row.kind === "duration"
                    ? DRIVER_UI.amber
                    : row.kind === "pending"
                      ? DRIVER_UI.su
                      : DRIVER_UI.tx,
                fontWeight: row.kind === "geo" ? 600 : 800,
                fontSize: row.kind === "geo" ? 11 : 12,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StopListRowCompact({ item, isCurrent }) {
  const { stop, label, group } = item;
  const { stateText, fg, bg } = stopCompactBadge(stop);
  const iconBg = group === "descarga" ? DEMO_UI.descargaSoft : DEMO_UI.cargaSoft;
  const iconColor = group === "descarga" ? DEMO_UI.descarga : DEMO_UI.carga;
  const iconChar = group === "descarga" ? "↓" : "↑";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        ...demoRowDivider(),
      }}
    >
      {isCurrent ? (
        <div
          style={{
            width: 3,
            flexShrink: 0,
            background: DEMO_UI.green,
            borderRadius: 0,
          }}
        />
      ) : null}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "12px 16px 12px",
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            background: iconBg,
            color: iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
          }}
          aria-hidden
        >
          {iconChar}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: DEMO_UI.tx, lineHeight: 1.25 }}>{label}</div>
          {stopCompletedSummary(item) ? (
            <div style={{ fontSize: 12, color: DEMO_UI.descarga, fontWeight: 700, marginTop: 3 }}>
              {stopCompletedSummary(item)}
            </div>
          ) : (
            <StopRecorridoInfoLines stop={stop} tone="demo" />
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 7px",
            borderRadius: 4,
            background: bg,
            color: fg,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {stateText}
        </span>
      </div>
    </div>
  );
}

function DriverRecorridoStops({
  items,
  currentStopId,
  firstCargaStopId,
  evidenciasByStop,
  canOperate,
  onConfirmMuelle,
  EvidenciasStopComponent,
  showToast,
  servicio,
  servicioId,
  conductorNombre,
  onEvidenciaSaved,
  acquireActionLocation,
}) {
  if (!items.length) {
    return (
      <div style={{ padding: "14px 16px", fontSize: 13, color: DEMO_UI.su }}>Sin paradas definidas para este servicio.</div>
    );
  }

  return (
    <div>
      {items.map((item) =>
        item.stop.id === currentStopId ? (
          <div key={item.stop.id} style={{ padding: "10px 12px 12px", ...demoRowDivider() }}>
            <OperationalStopCard
              item={item}
              isCurrent
              isFirstCarga={item.stop.id === firstCargaStopId}
              evidencias={evidenciasByStop?.[item.stop.id]}
              canOperate={canOperate && item.stop.id === currentStopId}
              onConfirmMuelle={onConfirmMuelle}
              EvidenciasStopComponent={EvidenciasStopComponent}
              showToast={showToast}
              servicio={servicio}
              servicioId={servicioId}
              conductorNombre={conductorNombre}
              onEvidenciaSaved={onEvidenciaSaved}
              acquireActionLocation={acquireActionLocation}
            />
          </div>
        ) : (
          <StopListRowCompact key={item.stop.id} item={item} isCurrent={false} />
        ),
      )}
    </div>
  );
}

function DriverEtaRecorridoFooter({ servicio }) {
  const eta = getEtaPrevista(servicio);
  const arrival =
    eta?.arrival_label || (eta?.arrival_at ? formatOperationalEtaLabel(eta.arrival_at) : null);
  const value = arrival || "Inicia ruta para calcular";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        fontSize: 13,
        color: DEMO_UI.tx,
        ...demoRowDivider(),
      }}
    >
      <span style={{ fontWeight: 500 }}>ETA prevista</span>
      <span style={{ fontStyle: arrival ? "normal" : "italic", color: arrival ? DEMO_UI.tx : DEMO_UI.su, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function DriverClienteDocumentosSection({
  cliente,
  referenciaCliente,
  goods,
  observations,
  servicio,
  empresa = null,
  stops = [],
  conductorUid = null,
  showToast,
  conductorNombreUploader,
}) {
  const hasDetails = hasServiceDetailsContent({ cliente, referenciaCliente, goods, observations });

  return (
    <details className="driver-svc-docs-coll" style={{ margin: 0 }}>
      <style>{`
        .driver-svc-docs-coll > summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          list-style: none;
          font-size: 13px;
          font-weight: 600;
          color: ${DEMO_UI.tx};
          padding: 14px 16px;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          border-bottom: 0.5px solid ${DEMO_UI.line};
        }
        .driver-svc-docs-coll > summary::-webkit-details-marker { display: none; }
        .driver-svc-docs-coll > summary::marker { content: ""; }
        .driver-svc-docs-coll .driver-docs-chev {
          font-size: 11px;
          color: ${DEMO_UI.muted};
          transition: transform 0.18s ease;
        }
        .driver-svc-docs-coll[open] .driver-docs-chev { transform: rotate(180deg); }
        .driver-svc-docs-coll[open] > summary { border-bottom: 0.5px solid ${DEMO_UI.line}; }
      `}</style>
      <summary>
        <span>Cliente y documentos</span>
        <span className="driver-docs-chev" aria-hidden>
          ▼
        </span>
      </summary>
      <div style={{ padding: "0 0 4px" }}>
        {hasDetails ? (
          <div style={{ padding: "12px 16px 14px", fontSize: 14, color: DEMO_UI.tx, ...demoRowDivider() }}>
            <div style={{ fontSize: 11, color: DEMO_UI.muted, fontWeight: 600, marginBottom: 4 }}>Cliente</div>
            <div style={{ marginBottom: 10, lineHeight: 1.35 }}>{cliente || "—"}</div>
            <div style={{ fontSize: 11, color: DEMO_UI.muted, fontWeight: 600, marginBottom: 4 }}>Ref. cliente</div>
            <div style={{ marginBottom: 10, lineHeight: 1.35 }}>{referenciaCliente || "—"}</div>
            <div style={{ fontSize: 11, color: DEMO_UI.muted, fontWeight: 600, marginBottom: 4 }}>Mercancía / bultos</div>
            <div style={{ marginBottom: 10, lineHeight: 1.35, color: DEMO_UI.su }}>{goods}</div>
            {observations ? (
              <>
                <div style={{ fontSize: 11, color: DEMO_UI.muted, fontWeight: 600, marginBottom: 4 }}>Observaciones</div>
                <div style={{ lineHeight: 1.35, color: DEMO_UI.su }}>{observations}</div>
              </>
            ) : null}
          </div>
        ) : null}
        <div style={{ padding: "12px 16px", ...demoRowDivider() }}>
          <ConductorDcdtPanel
            servicio={servicio}
            empresa={empresa}
            conductorUid={conductorUid}
            stops={stops}
            showToast={showToast}
            compact
          />
        </div>
        <div style={{ padding: "12px 16px", ...demoRowDivider() }}>
          <ServiceExtraDocumentsBlock
            servicio={servicio}
            showToast={showToast}
            uploaderName={conductorNombreUploader}
            tone="light"
            compact
          />
        </div>
        <div style={{ padding: "4px 16px 12px" }}>
          <ServiceEmpresaDocumentsBlock servicio={servicio} showToast={showToast} role="conductor" tone="light" compact />
        </div>
      </div>
    </details>
  );
}

function OperationalStopCard({
  item,
  isCurrent,
  isFirstCarga = false,
  evidencias,
  canOperate,
  onConfirmMuelle,
  EvidenciasStopComponent,
  showToast,
  servicio,
  servicioId,
  conductorNombre,
  onEvidenciaSaved,
  acquireActionLocation,
}) {
  const { stop, label, group } = item;
  const entrada = !!stop.hora_llegada_real;
  const salida = isStopCompleted(stop);
  const docs = stopDocumentSummary(evidencias);
  const operationName = operationNameForStop(stop);
  const inOperation = entrada && !salida;
  const stateText = salida ? "Completada" : inOperation ? "En muelle" : "Pendiente";
  const stateTone = salida
    ? { bg: DRIVER_UI.greenSoft, fg: DRIVER_UI.green }
    : inOperation
      ? { bg: DRIVER_UI.amberSoft, fg: DRIVER_UI.amber }
      : { bg: DRIVER_UI.surfaceHi, fg: DRIVER_UI.su };
  const Ev = EvidenciasStopComponent;
  const icon = stopTimelineIcon(group);
  const stopId = stop?.id;

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
              <div style={{ fontSize: 15, fontWeight: 800, color: DRIVER_UI.tx, lineHeight: 1.25 }}>{label}</div>
              {salida ? (
                <div style={{ fontSize: 12, color: DRIVER_UI.green, marginTop: 3, fontWeight: 800, lineHeight: 1.3 }}>
                  ✓ {operationName} completada · {stopTime(stop.hora_salida_real)}
                </div>
              ) : null}
              <StopRecorridoInfoLines stop={stop} tone="legacy" />
              {(entrada || salida || (isFirstCarga && servicio?.fecha_inicio)) && (
                <StopTimesBlock stop={stop} isFirstCarga={isFirstCarga} servicio={servicio} />
              )}
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
                <button
                  type="button"
                  onClick={() => onConfirmMuelle?.({ kind: "entrada", stopId: stop.id })}
                  style={muellePrimaryBtnStyle("green")}
                >
                  {primaryMuelleActionLabel(stop, "entrada")}
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
                  acquireActionLocation={acquireActionLocation}
                />
              ) : null}
              <button
                type="button"
                onClick={() => onConfirmMuelle?.({ kind: "salida", stopId: stop.id })}
                disabled={!canOperate}
                style={{
                  ...muellePrimaryBtnStyle("amber"),
                  marginTop: 12,
                  opacity: canOperate ? 1 : 0.55,
                  cursor: canOperate ? "pointer" : "default",
                }}
              >
                {finishActionLabelForStop(stop)}
              </button>
            </div>
          ) : null}

          {salida && docs.total > 0 ? (
            <div style={{ color: docs.incidencias ? DRIVER_UI.amber : DRIVER_UI.su, fontSize: 12, fontWeight: 700, marginTop: 10 }}>
              {docs.label}
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
  firstCargaStopId,
  evidenciasByStop,
  canOperate,
  onConfirmMuelle,
  EvidenciasStopComponent,
  showToast,
  servicio,
  servicioId,
  conductorNombre,
  onEvidenciaSaved,
  acquireActionLocation,
}) {
  if (!items.length) {
    return (
      <div style={{ borderRadius: 14, padding: "14px", color: DRIVER_UI.su, fontSize: 13, border: `1px dashed ${DRIVER_UI.line}` }}>
        Sin paradas definidas para este servicio.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) =>
        item.stop.id === currentStopId ? (
          <OperationalStopCard
            key={item.stop.id}
            item={item}
            isCurrent
            isFirstCarga={item.stop.id === firstCargaStopId}
            evidencias={evidenciasByStop?.[item.stop.id]}
            canOperate={canOperate && item.stop.id === currentStopId}
            onConfirmMuelle={onConfirmMuelle}
            EvidenciasStopComponent={EvidenciasStopComponent}
            showToast={showToast}
            servicio={servicio}
            servicioId={servicioId}
            conductorNombre={conductorNombre}
            onEvidenciaSaved={onEvidenciaSaved}
            acquireActionLocation={acquireActionLocation}
          />
        ) : (
          <div
            key={item.stop.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 12px",
              borderRadius: 12,
              border: `1px solid ${DRIVER_UI.line}`,
              background: DRIVER_UI.surface,
            }}
          >
            <span style={{ fontSize: 18 }} aria-hidden>
              {stopTimelineIcon(item.group)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: DRIVER_UI.tx }}>{item.label}</div>
              {stopCompletedSummary(item) ? (
                <div style={{ fontSize: 12, color: DRIVER_UI.green, fontWeight: 700, marginTop: 2 }}>
                  {stopCompletedSummary(item)}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: DRIVER_UI.su, marginTop: 2 }}>{stopCompactBadge(item.stop).stateText}</div>
              )}
            </div>
          </div>
        ),
      )}
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
  siguienteServicio = null,
  siguientesStops = [],
  empresaById = {},
  evidenciasByStop,
  showToast,
  onIniciarServicio,
  marcarLlegado,
  marcarCompletado,
  recargar,
  EvidenciasStopComponent,
  onOpenViajeModal,
  onIniciarRuta = null,
  onRecalculateOperationalRoute = null,
  onEvidenciaSaved,
  onCerrarExpediente,
  conductorNombre = "Conductor",
  norma = null,
  miParticipacion = null,
  totalParticipantes = 1,
  activosParticipantes = 1,
  onFinalizarParticipacion = null,
  conductorUid = null,
}) {
  const sig = getCockpitSignals(servicio, stops, evidenciasByStop);
  const { gate, acquireLocation, retry, continueWithout, cancelGate } = useDriverActionLocation();
  const muelleGpsRef = useRef(null);
  const [confirmMuelle, setConfirmMuelle] = useState(null);
  const [confirmMuelleSaving, setConfirmMuelleSaving] = useState(false);
  const [cierreSaving, setCierreSaving] = useState(false);
  const [confirmFinalizar, setConfirmFinalizar] = useState(false);
  const [finalizarSaving, setFinalizarSaving] = useState(false);
  const showCierreDocumental = useMemo(
    () => needsExpedienteClosure(servicio, stops) && typeof onCerrarExpediente === "function",
    [servicio, stops, onCerrarExpediente],
  );
  const timelineItems = useMemo(() => buildTimelineItems(stops), [stops]);
  const sortedStops = useMemo(() => timelineItems.map((item) => item.stop), [timelineItems]);
  const expandedStopId = resolveExpandedStopId(sortedStops, servicio);
  const firstCargaStopId = useMemo(() => {
    let seen = 0;
    for (const item of timelineItems) {
      if (item.group !== "carga") continue;
      seen += 1;
      if (seen === 1) return item.stop.id;
    }
    return null;
  }, [timelineItems]);
  const tacografoEstado = useMemo(() => {
    if (!norma) return null;
    return {
      isDriving: !!norma.isDriving,
      crType: norma.crType ?? "",
      crDur: Number(norma.crDur),
    };
  }, [norma]);
  const operationalPres = useMemo(
    () => getServiceOperationalPresentation(servicio, sortedStops),
    [servicio, sortedStops],
  );
  const routeLine =
    operationalPres.routeLine !== "— → —"
      ? operationalPres.routeLine
      : getFixedServiceRoute(servicio, "Origen", "Destino", sortedStops);
  const heroCliente = operationalPres.clienteNombre || getServiceClient(servicio) || "";
  const serviceNumber = getServiceNumberForDisplay(servicio);
  const cliente = heroCliente || "—";
  const referenciaCliente = getServiceClientReference(servicio) || "—";
  const goods = extractGoodsSummary(sortedStops, evidenciasByStop);
  const observations = extractObservations(sortedStops);
  const canOperateStops = mode !== "asignado" && servicio?.estado === "en_curso" && !showCierreDocumental;
  // FASE 2A multi-conductor: estado individual del conductor en este servicio.
  const esMultiConductor = Number(totalParticipantes) > 1;
  const miParticipacionLabel =
    miParticipacion === "finalizado"
      ? "Finalizada"
      : servicio?.estado === "en_curso"
        ? "Activa"
        : "Pendiente";
  // Anti-huérfano: el último conductor activo NO finaliza su parte; debe cerrar el servicio.
  const esUltimoActivo = Number(activosParticipantes) <= 1;
  const puedeFinalizarParticipacion =
    esMultiConductor &&
    !esUltimoActivo &&
    servicio?.estado === "en_curso" &&
    miParticipacion !== "finalizado" &&
    typeof onFinalizarParticipacion === "function";
  const scheduleLabel = fmtServiceSchedule(servicio?.fecha_inicio);
  const activeTimelineItem = timelineItems.find((it) => it.stop.id === expandedStopId);

  const handleMuelleRequest = ({ kind, stopId }) => {
    if (confirmMuelleSaving) return;
    muelleGpsRef.current = null;
    setConfirmMuelle({ kind, stopId });
  };

  const handleConfirmMuelle = async () => {
    if (!confirmMuelle || confirmMuelleSaving) return;
    const { kind, stopId } = confirmMuelle;
    const stop = sortedStops.find((s) => s.id === stopId);
    const { eventType, actionLabel } = muelleActionMeta(kind, stop);
    logMuelleGps("before request", { eventType, stopId, kind, actionLabel });
    const prefetchedGps = await acquireLocation(eventType, actionLabel);
    logMuelleGps("result", {
      eventType,
      stopId,
      cancelled: prefetchedGps === null,
      ok: !!prefetchedGps?.ok,
      usedCache: !!prefetchedGps?.usedCache,
      lat: prefetchedGps?.point?.lat ?? null,
      lng: prefetchedGps?.point?.lng ?? prefetchedGps?.point?.lon ?? null,
      accuracy: prefetchedGps?.point?.accuracy ?? null,
      status: prefetchedGps?.location_status ?? null,
      error: prefetchedGps?.error ?? prefetchedGps?.location_error ?? null,
    });
    if (prefetchedGps === null) return;
    muelleGpsRef.current = prefetchedGps;
    setConfirmMuelleSaving(true);
    try {
      if (kind === "entrada") {
        await marcarLlegado(stopId, { prefetchedGps });
      } else {
        await marcarCompletado(stopId, { prefetchedGps });
      }
      setConfirmMuelle(null);
      muelleGpsRef.current = null;
    } catch (error) {
      showToast?.(error?.message || "No se pudo registrar el muelle");
    } finally {
      setConfirmMuelleSaving(false);
    }
  };

  const handleConfirmFinalizarParticipacion = async () => {
    if (!onFinalizarParticipacion || finalizarSaving) return;
    setFinalizarSaving(true);
    try {
      await onFinalizarParticipacion();
      showToast?.("Has finalizado tu participación en este servicio");
      setConfirmFinalizar(false);
    } catch (error) {
      showToast?.(error?.message || "No se pudo finalizar tu participación");
    } finally {
      setFinalizarSaving(false);
    }
  };

  const serviceAction =
    mode === "asignado"
      ? {
          label: "Iniciar servicio",
          onClick: async () => {
            const prefetchedGps = await acquireLocation("inicio_servicio", "iniciar servicio");
            if (prefetchedGps === null) return;
            await onIniciarServicio(servicio.id, { prefetchedGps });
          },
        }
      : null;

  const handleStartRoute = async () => {
    const prefetchedGps = await acquireLocation("ruta_iniciada", "iniciar ruta");
    if (prefetchedGps === null) return;
    await onIniciarRuta?.(servicio?.id, { prefetchedGps });
  };

  const locationGateModal = (
    <DriverLocationGateModal
      open={!!gate}
      phase={gate?.phase}
      actionLabel={gate?.actionLabel}
      error={gate?.error}
      onRetry={retry}
      onContinue={continueWithout}
      onCancel={cancelGate}
    />
  );

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
      onClick={() => {
        if (confirmMuelleSaving) return;
        muelleGpsRef.current = null;
        setConfirmMuelle(null);
      }}
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
          {confirmMuelle.kind === "entrada"
            ? "Confirmar entrada en muelle"
            : "Confirmar salida de muelle"}
        </div>
        <div style={{ fontSize: 13, color: DRIVER_UI.su, lineHeight: 1.45, marginBottom: 18 }}>
          {confirmMuelle.kind === "entrada"
            ? "Se registra la hora de entrada y esta parada pasa a estar en operación."
            : "Se registra la salida de muelle y empieza el tramo en ruta hasta la siguiente entrada."}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            disabled={confirmMuelleSaving}
            onClick={() => {
              muelleGpsRef.current = null;
              setConfirmMuelle(null);
            }}
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
            {confirmMuelleSaving
              ? "Guardando..."
              : confirmMuelle.kind === "entrada"
                ? "Registrar entrada"
                : finishActionLabelForStop(confirmStop)}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /** Layout operativo plano: activo en todos los entornos (antes solo demo). */
  const demoRedesign = true;
  const servicioNoIniciado = mode === "asignado" || !servicio?.fecha_inicio;
  const origenRuta = operationalPres.places?.carga_nombre || operationalPres.origen;
  const destinoRuta = operationalPres.places?.descarga_nombre || operationalPres.destino;

  if (demoRedesign) {
    return (
      <div style={{ padding: "0 0 88px", width: "100%", maxWidth: DRIVER_PANEL_MAX_WIDTH, margin: "0 auto", background: DEMO_UI.page, minHeight: "70vh" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <DriverDemoSection>
            <DriverServiceHeader
              servicio={servicio}
              empresaById={empresaById}
              serviceNumber={serviceNumber}
              scheduleLabel={scheduleLabel}
            />
          </DriverDemoSection>

          <DriverDemoSection>
            <DriverTripHero
              conductorNombre={conductorNombre}
              origen={origenRuta}
              destino={destinoRuta}
              routeLine={routeLine}
              servicioNoIniciado={servicioNoIniciado}
              totalParticipantes={totalParticipantes}
            />
          </DriverDemoSection>

          {servicioNoIniciado ? (
            <DriverDemoSection>
              <DriverAlertNotStarted />
            </DriverDemoSection>
          ) : null}

          {serviceAction ? (
            <DriverDemoSection style={{ padding: "12px 16px" }}>
              <button type="button" onClick={serviceAction.onClick} style={demoPrimaryBtn(DEMO_UI.green)}>
                {serviceAction.label}
              </button>
            </DriverDemoSection>
          ) : null}

          <DriverDemoSection title="Recorrido" style={{ padding: 0 }}>
            <DriverRecorridoStops
              items={timelineItems}
              currentStopId={expandedStopId}
              firstCargaStopId={firstCargaStopId}
              evidenciasByStop={evidenciasByStop}
              canOperate={canOperateStops}
              onConfirmMuelle={handleMuelleRequest}
              EvidenciasStopComponent={EvidenciasStopComponent}
              showToast={showToast}
              servicio={servicio}
              servicioId={servicio?.id}
              conductorNombre={conductorNombre}
              onEvidenciaSaved={onEvidenciaSaved}
              acquireActionLocation={acquireLocation}
            />
            <div style={{ padding: "0 16px" }}>
              <EnRutaHastaProximaEntrada servicio={servicio} stops={sortedStops} />
            </div>
            <DriverEtaRecorridoFooter servicio={servicio} />
            {!showCierreDocumental && servicio && typeof onOpenViajeModal === "function" ? (
              <div style={{ padding: "12px 16px 14px" }}>
                <DriverOperationalRouteNav
                  servicio={servicio}
                  variant="demo"
                  emphasis="secondary"
                  showToast={showToast}
                  onStartRoute={handleStartRoute}
                  onOpenRoute={() => openOperationalRouteModal(servicio, onOpenViajeModal)}
                  onRecalculateRoute={onRecalculateOperationalRoute}
                />
              </div>
            ) : null}
          </DriverDemoSection>

          <DriverDemoSection style={{ padding: 0 }}>
            <DriverClienteDocumentosSection
              cliente={cliente}
              referenciaCliente={referenciaCliente}
              goods={goods}
              observations={observations}
              servicio={servicio}
              empresa={empresaById[servicio?.empresa_id] || null}
              stops={sortedStops}
              conductorUid={conductorUid}
              showToast={showToast}
              conductorNombreUploader={conductorNombre}
            />
          </DriverDemoSection>

          <DriverDemoSection title="Conductores">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                paddingBottom: 12,
                marginBottom: 12,
                ...demoRowDivider(),
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: DEMO_UI.tx }}>Mi participación</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 4,
                  color:
                    miParticipacionLabel === "Activa"
                      ? DEMO_UI.avatarGreenTx
                      : miParticipacionLabel === "Finalizada"
                        ? DEMO_UI.su
                        : DEMO_UI.amber,
                  background:
                    miParticipacionLabel === "Activa"
                      ? DEMO_UI.avatarGreen
                      : miParticipacionLabel === "Finalizada"
                        ? "#f5f5f4"
                        : DEMO_UI.amberSoft,
                }}
              >
                {miParticipacionLabel}
              </span>
            </div>
            <ParticipacionTiemposPanel servicio={servicio} stops={sortedStops} variant="driverRedesign" />
          </DriverDemoSection>

          {puedeFinalizarParticipacion ? (
            <DriverDemoSection style={{ padding: "12px 16px" }}>
              <button
                type="button"
                onClick={() => setConfirmFinalizar(true)}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: 8,
                  border: "0.5px solid rgba(185,28,28,.35)",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Finalizar mi participación
              </button>
            </DriverDemoSection>
          ) : esMultiConductor &&
            esUltimoActivo &&
            servicio?.estado === "en_curso" &&
            miParticipacion !== "finalizado" ? (
            <DriverDemoSection>
              <div style={{ fontSize: 13, color: DEMO_UI.su, fontWeight: 500, lineHeight: 1.45 }}>
                Eres el último conductor activo de este servicio. Completa las paradas y cierra el expediente para finalizarlo.
              </div>
            </DriverDemoSection>
          ) : null}

          {showCierreDocumental ? (
            <DriverDemoSection>
              <ExpedienteClosureBlock
                saving={cierreSaving}
                onConfirm={async ({ comentario, firmaCanvas }) => {
                  if (cierreSaving) return;
                  const prefetchedGps = await acquireLocation("finalizar_servicio", "finalizar servicio");
                  if (prefetchedGps === null) return;
                  setCierreSaving(true);
                  try {
                    await onCerrarExpediente?.({ comentario, firmaCanvas, prefetchedGps });
                    showToast?.("Expediente cerrado");
                  } catch (e) {
                    showToast?.(e?.message || "No se pudo cerrar el expediente");
                  } finally {
                    setCierreSaving(false);
                  }
                }}
              />
            </DriverDemoSection>
          ) : null}

          <DriverDemoSection title="Próximos servicios" style={{ padding: "12px 16px 14px" }}>
            {siguienteServicio ? (
              <SiguienteServicioAccordion servicio={siguienteServicio} stops={siguientesStops} empresaById={empresaById} />
            ) : (
              <div style={{ fontSize: 13, color: DEMO_UI.su, fontWeight: 500, lineHeight: 1.45, textAlign: "center" }}>
                No hay próximos servicios asignados
              </div>
            )}
          </DriverDemoSection>
        </div>
        {confirmMuelleDialog}
        {locationGateModal}
        {confirmFinalizar ? (
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
            onClick={() => !finalizarSaving && setConfirmFinalizar(false)}
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
                Finalizar mi participación
              </div>
              <div style={{ fontSize: 13, color: DRIVER_UI.su, lineHeight: 1.45, marginBottom: 18 }}>
                El servicio seguirá abierto para el resto de conductores. Tú quedarás libre para avanzar a otros servicios. Esta acción no cierra el servicio.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  disabled={finalizarSaving}
                  onClick={() => setConfirmFinalizar(false)}
                  style={{
                    flex: 1,
                    background: DRIVER_UI.surfaceHi,
                    color: DRIVER_UI.su,
                    border: `1px solid ${DRIVER_UI.line}`,
                    borderRadius: 12,
                    padding: "12px",
                    fontWeight: 700,
                    cursor: finalizarSaving ? "default" : "pointer",
                    opacity: finalizarSaving ? 0.65 : 1,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={finalizarSaving}
                  onClick={handleConfirmFinalizarParticipacion}
                  style={{
                    flex: 1,
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: 12,
                    padding: "12px",
                    fontWeight: 800,
                    cursor: finalizarSaving ? "default" : "pointer",
                    opacity: finalizarSaving ? 0.75 : 1,
                  }}
                >
                  {finalizarSaving ? "Finalizando..." : "Finalizar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 12px 88px", width: "100%", maxWidth: DRIVER_PANEL_MAX_WIDTH, margin: "0 auto", background: DRIVER_UI.bg, minHeight: "70vh" }}>
      <CockpitShell>
        <div style={{ marginBottom: 12 }}>
          <ServiceOriginBadge servicio={servicio} empresaById={empresaById} truncate={false} style={{ maxWidth: "100%", width: "100%" }} />
        </div>
        <ServiceHero
          clienteNombre={heroCliente}
          routeLine={routeLine}
          operationalLabel={sig.operationalMeta.label}
          scheduleLabel={scheduleLabel}
          serviceNumber={serviceNumber}
          attention={sig.attention}
          attentionReason={sig.attentionReason}
          serviceAction={serviceAction}
        />

        {esMultiConductor ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              padding: "9px 12px",
              borderRadius: 12,
              border: `1px solid ${DRIVER_UI.line}`,
              background: DRIVER_UI.surface,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: DRIVER_UI.su }}>Mi participación</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 999,
                color:
                  miParticipacionLabel === "Activa"
                    ? "#166534"
                    : miParticipacionLabel === "Finalizada"
                      ? DRIVER_UI.su
                      : "#92400e",
                background:
                  miParticipacionLabel === "Activa"
                    ? "#dcfce7"
                    : miParticipacionLabel === "Finalizada"
                      ? DRIVER_UI.surfaceHi
                      : "#fef3c7",
              }}
            >
              {miParticipacionLabel}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: DRIVER_UI.muted }}>
              {totalParticipantes} conductores
            </span>
          </div>
        ) : null}

        {hasServiceDetailsContent({ cliente, referenciaCliente, goods, observations }) ? (
          <ServiceDetailsCollapsible
            cliente={cliente}
            referenciaCliente={referenciaCliente}
            conductorNombre={conductorNombre}
            goods={goods}
            observations={observations}
          />
        ) : null}

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
            currentStopId={expandedStopId}
            firstCargaStopId={firstCargaStopId}
            evidenciasByStop={evidenciasByStop}
            canOperate={canOperateStops}
            onConfirmMuelle={handleMuelleRequest}
            EvidenciasStopComponent={EvidenciasStopComponent}
            showToast={showToast}
            servicio={servicio}
            servicioId={servicio?.id}
            conductorNombre={conductorNombre}
            onEvidenciaSaved={onEvidenciaSaved}
            acquireActionLocation={acquireLocation}
          />
          <EnRutaHastaProximaEntrada servicio={servicio} stops={sortedStops} />
        </div>

        {puedeFinalizarParticipacion ? (
          <button
            type="button"
            onClick={() => setConfirmFinalizar(true)}
            style={{
              marginTop: 14,
              width: "100%",
              minHeight: 46,
              padding: "11px 14px",
              borderRadius: 12,
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Finalizar mi participación
          </button>
        ) : esMultiConductor &&
          esUltimoActivo &&
          servicio?.estado === "en_curso" &&
          miParticipacion !== "finalizado" ? (
          <div
            style={{
              marginTop: 14,
              padding: "11px 14px",
              borderRadius: 12,
              border: `1px solid ${DRIVER_UI.line}`,
              background: DRIVER_UI.surfaceHi,
              color: DRIVER_UI.su,
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.45,
            }}
          >
            Eres el último conductor activo de este servicio. Completa las paradas y cierra el expediente para finalizarlo.
          </div>
        ) : null}

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
          <EtaPrevistaBlock servicio={servicio} tx={DRIVER_UI.tx} su={DRIVER_UI.su} subtle={DRIVER_UI.muted} />
        </div>

        <div style={{ marginTop: 14 }}>
          <ServiceExtraDocumentsBlock servicio={servicio} showToast={showToast} uploaderName={conductorNombre} tone="light" compact />
        </div>
        <ServiceEmpresaDocumentsBlock
          servicio={servicio}
          showToast={showToast}
          role="conductor"
          tone="light"
          compact
        />
        <ParticipacionTiemposPanel servicio={servicio} stops={sortedStops} />
        {!showCierreDocumental && servicio && typeof onOpenViajeModal === "function" ? (
          <div style={{ marginTop: 14 }}>
            <DriverOperationalRouteNav
              servicio={servicio}
              variant="driver"
              emphasis="secondary"
              showToast={showToast}
              onStartRoute={handleStartRoute}
              onOpenRoute={() => openOperationalRouteModal(servicio, onOpenViajeModal)}
              onRecalculateRoute={onRecalculateOperationalRoute}
            />
          </div>
        ) : null}

        {showCierreDocumental ? (
          <ExpedienteClosureBlock
            saving={cierreSaving}
            onConfirm={async ({ comentario, firmaCanvas }) => {
              if (cierreSaving) return;
              const prefetchedGps = await acquireLocation("finalizar_servicio", "finalizar servicio");
              if (prefetchedGps === null) return;
              setCierreSaving(true);
              try {
                await onCerrarExpediente?.({ comentario, firmaCanvas, prefetchedGps });
                showToast?.("Expediente cerrado");
              } catch (e) {
                showToast?.(e?.message || "No se pudo cerrar el expediente");
              } finally {
                setCierreSaving(false);
              }
            }}
          />
        ) : null}
      </CockpitShell>
      {siguienteServicio ? (
        <SiguienteServicioAccordion servicio={siguienteServicio} stops={siguientesStops} empresaById={empresaById} />
      ) : (
        <SiguienteServicioEmpty />
      )}
      {confirmMuelleDialog}
      {locationGateModal}
      {confirmFinalizar ? (
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
          onClick={() => !finalizarSaving && setConfirmFinalizar(false)}
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
              Finalizar mi participación
            </div>
            <div style={{ fontSize: 13, color: DRIVER_UI.su, lineHeight: 1.45, marginBottom: 18 }}>
              El servicio seguirá abierto para el resto de conductores. Tú quedarás libre para avanzar a otros servicios. Esta acción no cierra el servicio.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                disabled={finalizarSaving}
                onClick={() => setConfirmFinalizar(false)}
                style={{
                  flex: 1,
                  background: DRIVER_UI.surfaceHi,
                  color: DRIVER_UI.su,
                  border: `1px solid ${DRIVER_UI.line}`,
                  borderRadius: 12,
                  padding: "12px",
                  fontWeight: 700,
                  cursor: finalizarSaving ? "default" : "pointer",
                  opacity: finalizarSaving ? 0.65 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={finalizarSaving}
                onClick={handleConfirmFinalizarParticipacion}
                style={{
                  flex: 1,
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px",
                  fontWeight: 800,
                  cursor: finalizarSaving ? "default" : "pointer",
                  opacity: finalizarSaving ? 0.75 : 1,
                }}
              >
                {finalizarSaving ? "Finalizando..." : "Finalizar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
