import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ESTADO_COLOR, ESTADO_LABEL } from "../../domain/fleet/serviceStatus.js";
import { getCurrentStop, countCompletedStops } from "../../domain/service/serviceStops.js";
import {
  OPERATIONAL_GROUP_LABEL,
  computeTripOperationalMetrics,
} from "../../domain/service/tripOperationalDossier.js";
import { getServicioOperativaTimelineForCard } from "../../domain/service/serviceExpediente.js";
import {
  getServiceClientReference,
  getServiceNumberForDisplay,
} from "../../domain/service/serviceIdentity.js";
import { buildEmpresaFlotaCardSummary } from "./empresaFlotaServicioCardPresenter.js";
import { OperationalEtaSnapshotBlock } from "../services/components/OperationalEtaSnapshotBlock.jsx";
import { VisualEtaFence } from "../../ui/VisualEtaFence.jsx";
import { flotaEvsSigForStops, stopsOperativaSig } from "./empresaFlotaRefresh.js";
import { servicioSinConductorOperacional } from "../../domain/fleet/operationalPlaceholderConductor.js";
import { servicioAdminEditMode } from "../../domain/fleet/servicioAdminEdit.js";
import { stripServicioOperacionDisplay } from "../../domain/service/serviceOperacionMeta.js";
import { sbFetch } from "../../data/supabaseClient.js";
import { ServiceEmpresaDocumentsBlock } from "../services/components/ServiceEmpresaDocumentsBlock.jsx";

const UI = Object.freeze({
  surface: "#ffffff",
  surfaceSoft: "#f8fafc",
  border: "#dbe4ee",
  tx: "#0f172a",
  muted: "#64748B",
  subtle: "#475569",
  accent: "#2563eb",
  accentSoft: "#eff6ff",
  green: "#15803d",
  greenSoft: "#dcfce7",
  amber: "#b45309",
  amberSoft: "#ffedd5",
  red: "#b91c1c",
  redSoft: "#fee2e2",
});

const DEV_TONES = {
  ok: { fg: UI.green },
  warn: { fg: UI.amber },
  danger: { fg: UI.red },
};

function fmtClockMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stopTipoCompacto(stop) {
  return String(stop?.tipo || "parada").replace(/_/g, " ").toUpperCase();
}

function nextPendingStop(stops) {
  return [...(stops || [])]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .find((s) => s.estado === "pendiente") || null;
}

function EmpresaFlotaServicioCardImpl({
  servicio,
  stops,
  flotaEvs,
  flotaStopsMap,
  expanded,
  onToggleExpand,
  nowMs,
  ubicInfo,
  ubicRefresh,
  normaC,
  conductor,
  nombreConductor,
  responsableLine = null,
  operationalMeta,
  lastActivity,
  attention,
  attentionReason,
  onRefreshUbicacion,
  onAnular,
  onAsignarConductor,
  onEditarServicio,
  onDcdt,
  asignadosCount = 0,
  asignadosNombresStr = "",
  empresaNombre = "Empresa",
  showToast,
  fmtDur,
  tx,
  su,
}) {
  const expandedOnceRef = useRef(false);
  if (expanded) expandedOnceRef.current = true;

  const sinOp = servicioSinConductorOperacional(servicio);
  const puedeEditarAdmin = servicioAdminEditMode(servicio?.estado) != null;
  const [incidenciasServicio, setIncidenciasServicio] = useState([]);
  const [incFotosById, setIncFotosById] = useState({});

  const stopActual = getCurrentStop(stops);
  const nextStop = nextPendingStop(stops);
  const tacografoEstado = useMemo(() => {
    if (!normaC) return null;
    return {
      isDriving: !!normaC.isDriving,
      crType: normaC.crType || "",
      crDur: Number(normaC.crDur),
    };
  }, [normaC]);

  const latestLocation =
    ubicInfo && !ubicInfo.missing && !ubicInfo.fetchError ? ubicInfo : null;

  const summary = useMemo(
    () =>
      buildEmpresaFlotaCardSummary({
        servicio,
        stops,
        nowMs,
        tacografoEstado,
        nextStop,
        useLiveEta: false,
      }),
    [servicio, stops, nowMs, tacografoEstado, nextStop],
  );

  useEffect(() => {
    if (!expanded || !servicio?.id) return;
    let cancelled = false;
    (async () => {
      const ir = await sbFetch(`/rest/v1/incidencias?servicio_id=eq.${servicio.id}&order=registrado_en.desc`);
      const incs = ir.ok ? await ir.json().catch(() => []) : [];
      if (cancelled) return;
      const list = Array.isArray(incs) ? incs : [];
      setIncidenciasServicio(list);
      const ids = list.map((it) => it.id).filter(Boolean);
      if (!ids.length) {
        setIncFotosById({});
        return;
      }
      const er = await sbFetch(`/rest/v1/evidencias?incidencia_id=in.(${ids.join(",")})&order=created_at.desc`);
      const evs = er.ok ? await er.json().catch(() => []) : [];
      if (cancelled) return;
      const grouped = {};
      for (const ev of Array.isArray(evs) ? evs : []) {
        if (!ev?.incidencia_id) continue;
        if (!grouped[ev.incidencia_id]) grouped[ev.incidencia_id] = [];
        grouped[ev.incidencia_id].push(ev);
      }
      setIncFotosById(grouped);
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, servicio?.id]);

  const servicioReferencia = servicio?.referencia ?? "";

  const dossierMetrics = useMemo(() => {
    if (!expanded) return null;
    try {
      return computeTripOperationalMetrics(servicio, stops);
    } catch {
      return null;
    }
  }, [expanded, servicio, servicioReferencia, stops]);

  const operativaTimeline = useMemo(() => {
    if (!expanded) return [];
    try {
      return getServicioOperativaTimelineForCard({
        servicio,
        stops,
        evidenciasByStop: flotaEvs,
        metrics: dossierMetrics,
        nombreConductor,
        fmtDur,
        entries: conductor?.entries || [],
      });
    } catch {
      return [];
    }
  }, [
    expanded,
    servicio,
    servicioReferencia,
    stops,
    flotaEvs,
    dossierMetrics,
    nombreConductor,
    fmtDur,
    conductor?.entries,
  ]);

  const completados = countCompletedStops(stops);
  const progressLabel = stops.length ? `${completados}/${stops.length}` : "0/0";
  const incN = Number(servicio?.incidencias_total || 0);
  const incFotosN = Number(servicio?.incidencias_fotos_total || 0);
  const incBadgeLabel =
    incN === 1 ? "⚠ 1 incidencia" : incN > 1 ? `⚠ ${incN} incidencias` : null;
  const serviceNumber = getServiceNumberForDisplay(servicio) || "—";
  const refClienteCompact = getServiceClientReference(servicio);
  const stateColor = ESTADO_COLOR[servicio.estado] || su;
  const conductorLine = sinOp
    ? "Sin asignar"
    : servicio.conductor_id
      ? `Conductor · ${nombreConductor(servicio.conductor_id)}`
      : onAsignarConductor
        ? "Sin asignar"
        : null;
  const timelineSoloTexto = operativaTimeline;
  const ubicLine = ubicInfo?.label || (ubicInfo?.missing ? "Sin ubicación registrada" : "—");
  const ubicUpdated =
    ubicInfo?.recent === false ? "Sin actualización reciente" : ubicInfo ? "Ubicación reciente" : null;

  const toggle = () => onToggleExpand();

  return (
    <div
      style={{
        overflow: "hidden",
        background: UI.surface,
        border: `1px solid ${expanded ? "#c5d0dc" : UI.border}`,
        borderRadius: 12,
        boxShadow: expanded
          ? "0 2px 8px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.05)"
          : "0 1px 4px rgba(15, 23, 42, 0.07), 0 1px 2px rgba(15, 23, 42, 0.04)",
        borderLeft: attention && !expanded ? `3px solid ${UI.amber}` : undefined,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        style={{
          padding: "16px 12px 14px",
          minHeight: 56,
          cursor: "pointer",
          display: "flex",
          gap: 10,
          alignItems: "stretch",
          background: expanded ? UI.surface : "transparent",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {summary.clienteLine ? (
            <div
              style={{
                fontSize: 14,
                fontWeight: 750,
                color: tx,
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {summary.clienteLine}
            </div>
          ) : null}

          <div
            style={{
              fontSize: summary.clienteLine ? 13 : 15,
              fontWeight: summary.clienteLine ? 700 : 800,
              color: summary.clienteLine ? UI.subtle : tx,
              marginTop: summary.clienteLine ? 4 : 0,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summary.routeLabel}
          </div>

          {incBadgeLabel ? (
            <div
              style={{
                marginTop: 6,
                display: "inline-flex",
                alignItems: "center",
                fontSize: 12,
                fontWeight: 750,
                color: UI.amber,
                background: UI.amberSoft,
                border: "1px solid #fcd34d",
                borderRadius: 999,
                padding: "3px 9px",
                lineHeight: 1.25,
              }}
            >
              {incBadgeLabel}
            </div>
          ) : null}

          {asignadosCount > 1 ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: UI.subtle,
                marginTop: 4,
                lineHeight: 1.3,
              }}
            >
              Conductores asignados: {asignadosCount}
              <div style={{ fontSize: 12, color: UI.muted, fontWeight: 500, marginTop: 2 }}>
                {asignadosNombresStr}
              </div>
            </div>
          ) : conductorLine ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: UI.subtle,
                marginTop: 4,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {conductorLine}
            </div>
          ) : null}

          {responsableLine ? (
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: UI.muted,
                marginTop: conductorLine || asignadosCount > 1 ? 3 : 4,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {responsableLine}
            </div>
          ) : null}

          {(summary.estadoServicio || summary.progressLine) ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "6px 10px",
                marginTop: 8,
                fontSize: 12,
                color: UI.muted,
              }}
            >
              {summary.estadoServicio ? (
                <span
                  style={{
                    background: `${stateColor}18`,
                    color: stateColor,
                    border: `1px solid ${stateColor}33`,
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  {summary.estadoServicio}
                </span>
              ) : null}
              {summary.progressLine ? (
                <span style={{ fontWeight: 600, color: UI.subtle }}>{summary.progressLine}</span>
              ) : null}
            </div>
          ) : null}

          {summary.contextLine ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 750,
                color: tx,
                marginTop: 10,
                lineHeight: 1.35,
              }}
            >
              {summary.contextLine}
            </div>
          ) : null}

          {summary.arrivalLabel ? (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: UI.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.35,
                }}
              >
                {summary.etaCaption || "ETA inicial"}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: tx,
                  marginTop: 3,
                  lineHeight: 1.2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {summary.arrivalLabel}
              </div>
            </div>
          ) : null}

          {summary.deviation ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                fontWeight: 750,
                color: (DEV_TONES[summary.deviation.tone] || DEV_TONES.warn).fg,
                lineHeight: 1.35,
              }}
            >
              {summary.deviation.text}
            </div>
          ) : null}

          {summary.remainingLine ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12.5,
                fontWeight: 600,
                color: UI.subtle,
                lineHeight: 1.35,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {summary.remainingLine}
            </div>
          ) : null}

          {attention && !expanded ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                fontWeight: 700,
                color: UI.amber,
                lineHeight: 1.3,
              }}
            >
              Atención requerida
            </div>
          ) : null}

          {onAsignarConductor && !expanded && !servicio.conductor_id ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAsignarConductor();
              }}
              style={{
                marginTop: 10,
                background: UI.accentSoft,
                color: UI.accent,
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Asignar conductor
            </button>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            minWidth: 48,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              border: `1px solid ${UI.border}`,
              background: UI.surfaceSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              color: UI.muted,
              lineHeight: 1,
            }}
          >
            {expanded ? "⌄" : "›"}
          </div>
        </div>
      </div>

      {expandedOnceRef.current ? (
        <div
          style={{
            display: expanded ? "block" : "none",
            borderTop: `1px solid ${UI.border}`,
            padding: "12px 10px 14px",
            background: UI.surfaceSoft,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: UI.muted,
              fontWeight: 600,
              marginBottom: 12,
              lineHeight: 1.4,
            }}
          >
            {serviceNumber}
            {refClienteCompact ? ` · Ref. ${refClienteCompact}` : ""}
          </div>

          <div
            style={{
              background: UI.surface,
              borderRadius: 10,
              padding: "12px 12px",
              marginBottom: 12,
              border: `1px solid ${UI.border}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: tx, marginBottom: 10 }}>
              Operativa del servicio
            </div>

            {!sinOp ? (
              <>
                <div
                  style={{
                    fontSize: 10,
                    color: su,
                    fontWeight: 650,
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: 0.35,
                  }}
                >
                  Línea de tiempo
                </div>
                {timelineSoloTexto.length > 0 ? (
                <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
                  {timelineSoloTexto.map((ev, i) => (
                    <div
                      key={`${ev.ts}-${i}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "54px 1fr",
                        gap: 8,
                        padding: "7px 0",
                        borderBottom:
                          i < timelineSoloTexto.length - 1 ? `1px solid ${UI.border}` : "none",
                        alignItems: "start",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: su,
                          fontFamily: "monospace",
                          paddingTop: 1,
                        }}
                      >
                        {ev.time || "—"}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 650, color: tx, lineHeight: 1.25 }}>
                          {ev.title}
                        </div>
                        {ev.detail ? (
                          <div style={{ fontSize: 11, color: su, lineHeight: 1.35, marginTop: 2 }}>
                            {ev.detail}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                ) : (
                  <div style={{ fontSize: 12, color: su, marginBottom: 12, lineHeight: 1.4 }}>
                    Sin eventos en la línea de tiempo todavía.
                  </div>
                )}
              </>
            ) : null}


            {!dossierMetrics?.perStop?.length ? (
              <div style={{ fontSize: 12, color: su, marginBottom: 10 }}>
                Sin paradas registradas en el plan.
              </div>
            ) : (
              dossierMetrics.perStop.map((row, idx) => {
                const labelGroup = OPERATIONAL_GROUP_LABEL[row.group] || row.stop.tipo || "PARADA";
                const titulo = `${labelGroup} — ${row.stop.nombre || "Sin nombre"}`;
                return (
                  <div
                    key={row.stop.id || idx}
                    style={{
                      background: UI.surface,
                      borderRadius: 10,
                      padding: "10px 12px",
                      marginBottom: 8,
                      border: `1px solid ${UI.border}`,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 650, color: tx, marginBottom: 8 }}>
                      {titulo}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: su }}>
                      <div>
                        <span style={{ color: "#94A3B8" }}>Entrada muelle · </span>
                        <span style={{ color: tx, fontWeight: 600 }}>{fmtClockMs(row.entradaMuelleMs)}</span>
                      </div>
                      <div>
                        <span style={{ color: "#94A3B8" }}>Salida muelle · </span>
                        <span style={{ color: tx, fontWeight: 600 }}>{fmtClockMs(row.salidaMuelleMs)}</span>
                      </div>
                      <div>
                        <span style={{ color: "#94A3B8" }}>Tiempo en planta · </span>
                        <span style={{ color: "#F59E0B", fontWeight: 700 }}>
                          {row.tiempoEnPlantaMin != null ? fmtDur(row.tiempoEnPlantaMin) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {!sinOp && servicio.estado !== "anulado" ? (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: `1px solid ${UI.border}`,
                }}
              >
                <VisualEtaFence resetKey={servicio?.id} su={su}>
                  <OperationalEtaSnapshotBlock
                    servicio={servicio}
                    nowMs={nowMs}
                    tx={tx}
                    su={su}
                    subtle={UI.subtle}
                    layout="empresa"
                  />
                </VisualEtaFence>
                {nextStop ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: su, lineHeight: 1.35 }}>
                    ETA / siguiente punto ·{" "}
                    <strong style={{ color: tx }}>{nextStop.nombre || "—"}</strong>
                    {nextStop.tipo ? (
                      <span style={{ fontWeight: 600 }}> · {stopTipoCompacto(nextStop)}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            style={{
              background: UI.surface,
              borderRadius: 10,
              padding: "12px 12px",
              marginBottom: 10,
              border: `1px solid ${UI.border}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: tx, marginBottom: 8 }}>
              Incidencias ({incidenciasServicio.length})
            </div>
            {!incidenciasServicio.length ? (
              <div style={{ fontSize: 12, color: su }}>Sin incidencias registradas.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {incidenciasServicio.map((inc) => {
                  const fotos = incFotosById[inc.id] || [];
                  return (
                    <div key={inc.id} style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 9, padding: "8px 9px" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#9f1239" }}>{inc.titulo}</div>
                      {inc.descripcion ? <div style={{ fontSize: 12, color: "#7f1d1d", marginTop: 2 }}>{inc.descripcion}</div> : null}
                      <div style={{ fontSize: 11, color: su, marginTop: 3 }}>
                        {(() => {
                          const t = new Date(inc.registrado_en || inc.created_at).getTime();
                          return Number.isFinite(t) ? fmtClockMs(t) : "—";
                        })()}{" "}
                        · {inc.fase_operativa || "—"} · Fotos {fotos.length}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <ServiceEmpresaDocumentsBlock
              servicio={servicio}
              showToast={showToast}
              role="empresa"
              uploaderDisplayName={empresaNombre}
              tone="light"
              compact
            />
          </div>

          <div
            style={{
              background: UI.surface,
              borderRadius: 10,
              padding: "12px 12px",
              marginBottom: 10,
              border: `1px solid ${UI.border}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: tx, marginBottom: 10 }}>
              Resumen operacional
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(152px, 1fr))",
                gap: 8,
              }}
            >
              {[
                {
                  l: "Tiempo total viaje",
                  v:
                    dossierMetrics?.tiempoTotalViajeMin != null
                      ? fmtDur(dossierMetrics.tiempoTotalViajeMin)
                      : "—",
                },
                { l: "Conducción", v: fmtDur(dossierMetrics?.tiempoConduccionMin) },
                { l: "En planta · cargas", v: fmtDur(dossierMetrics?.tiempoEnPlantaCargaMin) },
                { l: "En planta · descargas", v: fmtDur(dossierMetrics?.tiempoEnPlantaDescargaMin) },
                { l: "Incidencias", v: String(incN), raw: true },
                { l: "Fotos incidencias", v: String(incFotosN || incidenciasServicio.reduce((n, inc) => n + (incFotosById[inc.id]?.length || 0), 0)), raw: true },
              ].map(({ l, v, raw }) => (
                <div
                  key={l}
                  style={{
                    background: UI.surfaceSoft,
                    border: `1px solid ${UI.border}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <div style={{ fontSize: 10, color: su, fontWeight: 500, marginBottom: 3 }}>{l}</div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 650,
                      color: raw && Number(v) > 0 ? UI.amber : tx,
                      fontFamily: raw ? undefined : "monospace",
                    }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: su, marginBottom: 8 }}>
              <span
                style={{
                  background: operationalMeta?.color ? `${operationalMeta.color}18` : UI.surfaceSoft,
                  color: operationalMeta?.color || su,
                  border: `1px solid ${UI.border}`,
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  marginRight: 8,
                }}
              >
                {operationalMeta?.label}
              </span>
              <span>Última actividad: {lastActivity?.label}</span>
            </div>

            {attention && attentionReason ? (
              <div style={{ fontSize: 12, color: UI.amber, lineHeight: 1.35, marginBottom: 8 }}>
                {attentionReason}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px 12px",
                fontSize: 12.5,
                color: UI.subtle,
                marginBottom: 10,
              }}
            >
              <span>
                {asignadosCount > 1 ? "Conductores · " : "Conductor · "}
                {asignadosCount > 1
                  ? asignadosNombresStr
                  : sinOp
                    ? "Sin asignar"
                    : nombreConductor(servicio.conductor_id)}
              </span>
              {responsableLine ? <span>{responsableLine}</span> : null}
              <span>Paradas · {progressLabel}</span>
              <span>
                Próxima: <strong style={{ color: tx }}>{nextStop?.nombre || "—"}</strong>
                {nextStop ? ` · ${stopTipoCompacto(nextStop)}` : ""}
              </span>
            </div>

            {servicio.estado !== "anulado" && !sinOp ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12,
                  color: UI.subtle,
                  marginBottom: 10,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  Última ubicación · {ubicLine}
                  {ubicUpdated ? (
                    <span style={{ color: su, fontSize: 11, fontWeight: 600 }}> · {ubicUpdated}</span>
                  ) : null}
                </span>
                {!sinOp && servicio.conductor_id ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefreshUbicacion?.();
                    }}
                    disabled={!!ubicRefresh?.loading}
                    style={{
                      background: UI.accentSoft,
                      border: "1px solid #bfdbfe",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 10,
                      color: "#1d4ed8",
                      cursor: ubicRefresh?.loading ? "default" : "pointer",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {ubicRefresh?.loading ? "..." : "↻ Actualizar"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {ubicRefresh?.error ? (
              <div style={{ fontSize: 10.5, color: UI.amber, marginBottom: 8, fontWeight: 700 }}>
                {ubicRefresh.error}
              </div>
            ) : null}

            {stops.length > 0 ? (
              <div
                style={{
                  background: "#e2e8f0",
                  borderRadius: 4,
                  height: 5,
                  overflow: "hidden",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    background: servicio.estado === "completado" ? UI.green : UI.accent,
                    height: "100%",
                    width: `${(completados / stops.length) * 100}%`,
                    borderRadius: 4,
                  }}
                />
              </div>
            ) : null}

            {stopActual && servicio.estado === "en_curso" ? (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: su, marginBottom: 3 }}>Parada actual</div>
                <div style={{ fontSize: 14, fontWeight: 650, color: tx }}>{stopActual.nombre}</div>
                <div style={{ fontSize: 12, color: su }}>
                  {String(stopActual.tipo || "").replace("_", " ").toUpperCase()} · {stopActual.orden}/{stops.length}
                </div>
              </div>
            ) : null}

            {normaC && servicio.estado === "en_curso" && !sinOp ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: su, marginBottom: 6 }}>
                  Tacógrafo · {nombreConductor(servicio.conductor_id)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {[
                    {
                      l: "Disponible",
                      v: normaC.canDrive <= 0 ? "Parar" : fmtDur(normaC.canDrive),
                      c: normaC.canDrive <= 0 ? UI.red : normaC.canDrive <= 30 ? UI.amber : UI.green,
                    },
                    { l: "Hoy", v: fmtDur(normaC.todayDrive), c: UI.amber },
                    { l: "Semana", v: fmtDur(normaC.weekDrive), c: "#64748B" },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 650, color: c, fontFamily: "monospace" }}>
                        {v}
                      </div>
                      <div style={{ fontSize: 10, color: su, marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ fontSize: 12, color: su, marginBottom: 4 }}>
              Estado administrativo ·{" "}
              <span style={{ fontWeight: 600, color: stateColor }}>{ESTADO_LABEL[servicio.estado] || servicio.estado}</span>
            </div>

            {servicio.fecha_inicio ? (
              <div style={{ fontSize: 12, color: su }}>
                Salida programada:{" "}
                {new Date(servicio.fecha_inicio).toLocaleString("es-ES", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            ) : null}

            {puedeEditarAdmin && onEditarServicio ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditarServicio();
                }}
                style={{
                  width: "100%",
                  marginTop: 12,
                  background: UI.surface,
                  color: UI.accent,
                  border: `1px solid ${UI.border}`,
                  borderRadius: 9,
                  padding: "10px 10px",
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Editar servicio
              </button>
            ) : null}

            {onDcdt ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDcdt();
                }}
                style={{
                  width: "100%",
                  marginTop: 8,
                  background: "#fffbeb",
                  color: "#92400e",
                  border: "1px solid #fcd34d",
                  borderRadius: 9,
                  padding: "10px 10px",
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                DCDT
              </button>
            ) : null}

            {onAsignarConductor ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAsignarConductor();
                }}
                style={{
                  width: "100%",
                  marginTop: 12,
                  background: UI.accentSoft,
                  color: UI.accent,
                  border: "1px solid #bfdbfe",
                  borderRadius: 9,
                  padding: "10px 10px",
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {servicio.conductor_id ? "Gestionar conductores" : "Asignar conductor"}
              </button>
            ) : null}

            {servicio.estado !== "anulado" ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAnular?.();
                }}
                style={{
                  width: "100%",
                  marginTop: 12,
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "1px solid #cbd5e1",
                  borderRadius: 9,
                  padding: "10px 10px",
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Anular servicio
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function propsEqual(prev, next) {
  if (prev.expanded !== next.expanded) return false;
  if (prev.nowMs !== next.nowMs) return false;
  if (prev.servicio?.id !== next.servicio?.id) return false;
  if (prev.servicio?.estado !== next.servicio?.estado) return false;
  if (
    stripServicioOperacionDisplay(prev.servicio?.referencia) !==
    stripServicioOperacionDisplay(next.servicio?.referencia)
  ) {
    return false;
  }
  if (prev.servicio?.conductor_id !== next.servicio?.conductor_id) return false;
  if (prev.asignadosCount !== next.asignadosCount) return false;
  if (prev.asignadosNombresStr !== next.asignadosNombresStr) return false;
  if (stopsOperativaSig(prev.stops) !== stopsOperativaSig(next.stops)) return false;
  if (flotaEvsSigForStops(prev.stops, prev.flotaEvs) !== flotaEvsSigForStops(next.stops, next.flotaEvs)) return false;
  if (prev.attention !== next.attention) return false;
  if (prev.ubicRefresh !== next.ubicRefresh) return false;
  const la = prev.ubicInfo;
  const lb = next.ubicInfo;
  if (la !== lb) {
    if (!la || !lb) return false;
    if (la.lat !== lb.lat || la.lon !== lb.lon) return false;
    if ((la.ts || la.updatedAt) !== (lb.ts || lb.updatedAt)) return false;
  }
  if (prev.normaC !== next.normaC) {
    if (!prev.normaC || !next.normaC) return false;
    if (prev.normaC.isDriving !== next.normaC.isDriving) return false;
  }
  return true;
}

export const EmpresaFlotaServicioCard = memo(EmpresaFlotaServicioCardImpl, propsEqual);
