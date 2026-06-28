import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OperationalStopCard,
  buildTimelineItems,
  DRIVER_UI,
  DRIVER_BACK_BUTTON_STYLE,
  DRIVER_STATUS_BADGE_FONT_SIZE,
} from "./ActiveServicePanel.jsx";
import { DriverLocationGateModal } from "./DriverLocationGateModal.jsx";
import { DriverQuickActionsBar } from "./ServiceQuickActionsBar.jsx";
import { DriverDcdtActionModal } from "./DriverDcdtActionModal.jsx";
import { ServiceMessagesModal } from "./ServiceMessagesModal.jsx";
import { ConductorFinalizarParticipacionAction } from "./ConductorFinalizarParticipacionAction.jsx";
import { ConductorDropStopAction } from "./ConductorDropStopAction.jsx";
import { useDriverFlatPendingStops } from "../hooks/useDriverFlatPendingStops.js";
import { useDriverActionLocation } from "../hooks/useDriverActionLocation.js";
import { useConductorDcdtQuickStatus } from "../hooks/useConductorDcdtQuickStatus.js";
import { useServiceMessagesUnread } from "../hooks/useServiceMessagesUnread.js";
import { useEmpresaOriginLookup } from "../../../hooks/useEmpresaOriginLookup.js";
import { isServiceMessagesEnabled } from "../../../config/serviceMessages.js";
import { fetchEvidenciasGroupedByStop } from "../../../domain/service/serviceDocuments.js";
import { mergeEvidenciaIntoByStop } from "../../../domain/documents/operationalEvidenciaSync.js";
import { stopsOperativaSig } from "../../../features/empresa/empresaFlotaRefresh.js";
import { isStopOperationallyComplete, findEarlierPendingStopInRoute } from "../../../domain/service/serviceStops.js";
import { pendingStopDisplayLabel } from "../../../domain/service/driverFlatStopList.js";
import { sbFetch } from "../../../data/supabaseClient.js";
import { useAutoOperationalEtaToFirstDescarga } from "../hooks/useAutoOperationalEtaToFirstDescarga.js";
import {
  getFirstPendingDescargaStop,
  hasCompletedDescargaStop,
} from "../../../domain/service/operationalEtaAutoRefresh.js";
import { resolveEtaVisual } from "../../../domain/service/operationalEtaPresentation.js";
import { useEtaVisualClockMs } from "../../../domain/service/useEtaVisualClock.js";
import { DescargaEntregaFirmaModal } from "./DescargaEntregaFirmaModal.jsx";
import { ConductorPostDescargaModal } from "./ConductorPostDescargaModal.jsx";
import { persistDescargaEntregaFirma } from "../../../domain/service/persistDescargaEntregaFirma.js";
import { isDescargaStopTipo } from "../../../domain/fleet/stopTypes.js";
import { isDecaAplicable } from "../../../domain/service/servicioAlcance.js";
import {
  fetchParticipacionResumenServicio,
  isConductorUltimoActivoEnServicio,
} from "../../../domain/fleet/servicioAssignment.js";
import { withOperationTimeout } from "../../../domain/service/operationTimeout.js";

const PAGE = "#F8FAFC";
/** Referencias estables — evitar bucle infinito en hooks (useEmpresaOriginLookup / useConductorDcdtQuickStatus). */
const NO_STOPS = [];
const NO_SERVICIOS = [];

function muelleActionMeta(kind, stop) {
  const tipo = String(stop?.tipo || "").toLowerCase();
  if (kind === "entrada") return { eventType: "entrada_muelle", actionLabel: "entrada en muelle" };
  if (tipo === "descarga") return { eventType: "completar_descarga", actionLabel: "completar descarga" };
  if (tipo === "carga") return { eventType: "completar_carga", actionLabel: "completar carga" };
  return { eventType: "salida_muelle", actionLabel: "salida de muelle" };
}

function finishActionLabelForStop(stop) {
  const tipo = String(stop?.tipo || "").toLowerCase();
  if (tipo === "descarga") return "Completar descarga";
  if (tipo === "carga") return "Completar carga";
  if (tipo.includes("carga") && tipo.includes("descarga")) return "Completar operación";
  return "Salida de muelle";
}

function stopGroupIcon(tipoLabel) {
  if (tipoLabel === "Carga") return "📦";
  if (tipoLabel === "Descarga") return "📤";
  return "📍";
}

function TripServiceRefPill({ tripServiceRef, tripVisual }) {
  if (!tripServiceRef) return null;
  const vis = tripVisual;
  return (
    <span
      style={{
        display: "inline-block",
        maxWidth: "100%",
        fontSize: 10,
        fontWeight: 800,
        padding: "3px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        verticalAlign: "middle",
        lineHeight: 1.2,
        color: vis?.chipFg || "#1e40af",
        background: vis?.chipBg || "#dbeafe",
        border: `1px solid ${vis?.stripe || "#2563eb"}55`,
        letterSpacing: 0.15,
      }}
      title={tripServiceRef}
    >
      {tripServiceRef}
    </span>
  );
}

const DRIVER_STOP_LOCATION_STYLE = {
  fontSize: 13,
  color: DRIVER_UI.su,
  lineHeight: 1.45,
  fontWeight: 600,
  wordBreak: "normal",
  overflowWrap: "break-word",
  whiteSpace: "normal",
};

/** Cabecera de tarjeta: título en una línea; pastilla viaje debajo (no compite por ancho). */
function DriverStopCardHeader({
  title,
  subtitle,
  referenciaCliente = null,
  tripServiceRef,
  tripVisual,
  statusLabel = null,
  statusEnMuelle = false,
  titleSize = 16,
  showSubtitle = true,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, width: "100%" }}>
      <div
        style={{
          fontSize: titleSize,
          fontWeight: 800,
          color: DRIVER_UI.tx,
          lineHeight: 1.25,
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      {referenciaCliente ? (
        <div style={{ fontSize: 12, color: DRIVER_UI.muted, fontWeight: 600, lineHeight: 1.3 }}>
          Ref. {referenciaCliente}
        </div>
      ) : null}
      {tripServiceRef || statusLabel ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, maxWidth: "100%" }}>
          <TripServiceRefPill tripServiceRef={tripServiceRef} tripVisual={tripVisual} />
          {statusLabel ? (
            <span
              style={{
                fontSize: DRIVER_STATUS_BADGE_FONT_SIZE,
                fontWeight: 800,
                padding: "6px 12px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                lineHeight: 1.2,
                color: statusEnMuelle ? "#b45309" : DRIVER_UI.su,
                background: statusEnMuelle ? "#fef3c7" : DRIVER_UI.surfaceHi,
                border: `1px solid ${statusEnMuelle ? "#fcd34d" : DRIVER_UI.line}`,
              }}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {showSubtitle && subtitle ? <div style={DRIVER_STOP_LOCATION_STYLE}>{subtitle}</div> : null}
    </div>
  );
}

/** Estado visible en la lista plana (pendiente vs en muelle). */
function flatStopListStatus(stop) {
  if (stop?.hora_salida_real || stop?.estado === "completado") {
    return { phase: "completada", label: null, actionLabel: "EMPEZAR" };
  }
  const enMuelle = !!stop?.hora_llegada_real || stop?.estado === "llegado";
  if (enMuelle) {
    const hora = stop?.hora_llegada_real
      ? new Date(stop.hora_llegada_real).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      : null;
    return {
      phase: "en_muelle",
      label: hora ? `En muelle desde las ${hora}` : "En muelle",
      actionLabel: "CONTINUAR",
    };
  }
  return { phase: "pendiente", label: "Pendiente", actionLabel: "EMPEZAR" };
}

export function ConductorSimplifiedParadasTab({
  uid,
  norma = null,
  conductorNombre = "Conductor",
  showToast,
  marcarLlegadoEn,
  marcarCompletadoEn,
  iniciarServicioEn,
  recalculateOperationalRoute,
  EvidenciasStopComponent,
  onOpenMasServicio,
  soltarParadaEn,
  finalizarParticipacionEn,
}) {
  const { loading, items, finalizarServicios } = useDriverFlatPendingStops(uid);
  const etaClockMs = useEtaVisualClockMs();
  useAutoOperationalEtaToFirstDescarga({
    uid,
    norma,
    items,
    recalculateRoute: recalculateOperationalRoute,
    enabled: !loading && !!uid && typeof recalculateOperationalRoute === "function",
  });
  const [active, setActive] = useState(null);
  const [localServicio, setLocalServicio] = useState(null);
  const [localStops, setLocalStops] = useState([]);
  const [evidenciasByStop, setEvidenciasByStop] = useState({});
  const [confirmMuelle, setConfirmMuelle] = useState(null);
  const [confirmMuelleSaving, setConfirmMuelleSaving] = useState(false);
  const [iniciarSaving, setIniciarSaving] = useState(false);
  const [dcdtModalOpen, setDcdtModalOpen] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const [descargaFirma, setDescargaFirma] = useState(null);
  const [descargaFirmaSaving, setDescargaFirmaSaving] = useState(false);
  const [postDescarga, setPostDescarga] = useState(null);
  const [evidenciasSeed, setEvidenciasSeed] = useState(null);
  const [listDcdtServicioId, setListDcdtServicioId] = useState(null);
  const [orderSkipConfirm, setOrderSkipConfirm] = useState(null);
  const [participacionResumen, setParticipacionResumen] = useState(null);
  const muelleGpsRef = useRef(null);
  const { gate, acquireLocation, retry, continueWithout, cancelGate } = useDriverActionLocation();

  const detailServicio = active ? localServicio : null;
  const detailServicioForAlcance = active?.servicio ?? detailServicio;
  const detailStops = active ? localStops : NO_STOPS;
  const serviciosForEmpresaLookup = useMemo(() => {
    const byId = new Map();
    if (detailServicioForAlcance?.id) byId.set(detailServicioForAlcance.id, detailServicioForAlcance);
    for (const it of items) {
      if (it.servicio?.id) byId.set(it.servicio.id, it.servicio);
    }
    return [...byId.values()];
  }, [detailServicioForAlcance, items]);
  const empresaById = useEmpresaOriginLookup(serviciosForEmpresaLookup);
  const empresaServicio = detailServicioForAlcance?.empresa_id ? empresaById[detailServicioForAlcance.empresa_id] : null;
  const showDcdtQuick = !!detailServicioForAlcance?.empresa_id && isDecaAplicable(detailServicioForAlcance);
  const showChatQuick = isServiceMessagesEnabled(detailServicio);
  const dcdtQuick = useConductorDcdtQuickStatus({
    servicio: detailServicioForAlcance,
    empresa: empresaServicio,
    conductorUid: uid,
    stops: detailStops,
    pollWhileIncomplete: !!active,
  });
  const messagesUnread = useServiceMessagesUnread({
    servicioId: detailServicio?.id,
    userId: uid,
    enabled: !!active && showChatQuick && !!detailServicio?.id,
  });

  const firstDescargaStopIdByServicio = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const sid = item.servicio?.id;
      if (!sid || map.has(sid)) continue;
      if (hasCompletedDescargaStop(item.stops)) continue;
      const first = getFirstPendingDescargaStop(item.stops);
      if (first?.id) map.set(sid, first.id);
    }
    return map;
  }, [items]);

  const openItem = useCallback((item, { readOnly = false } = {}) => {
    setActive(item);
    setLocalServicio(item.servicio);
    setLocalStops(item.stops);
    setDetailReadOnly(!!readOnly);
  }, []);

  const handleOpenItem = useCallback(
    (item, { readOnly = false } = {}) => {
      if (!readOnly) {
        const status = flatStopListStatus(item.stop);
        if (status.actionLabel === "EMPEZAR") {
          const earlier = findEarlierPendingStopInRoute(item.stops, item.stop);
          if (earlier) {
            setOrderSkipConfirm({
              item,
              earlierLabel: pendingStopDisplayLabel(earlier, item.stops),
            });
            return;
          }
        }
      }
      openItem(item, { readOnly });
    },
    [openItem],
  );

  const listDcdtItem = useMemo(
    () => items.find((it) => it.servicio?.id === listDcdtServicioId) || null,
    [items, listDcdtServicioId],
  );
  const listDcdtEmpresa = listDcdtItem?.servicio?.empresa_id ? empresaById[listDcdtItem.servicio.empresa_id] : null;
  const listDcdtQuick = useConductorDcdtQuickStatus({
    servicio: listDcdtItem?.servicio ?? null,
    empresa: listDcdtEmpresa,
    conductorUid: uid,
    stops: listDcdtItem?.stops ?? NO_STOPS,
    pollWhileIncomplete: !!listDcdtServicioId,
  });

  const closeDetail = useCallback(() => {
    setActive(null);
    setLocalServicio(null);
    setLocalStops([]);
    setConfirmMuelle(null);
    setConfirmMuelleSaving(false);
    setOrderSkipConfirm(null);
    setDcdtModalOpen(false);
    setChatModalOpen(false);
    setDetailReadOnly(false);
    setPostDescarga(null);
    setEvidenciasSeed(null);
  }, []);

  const stopsSig = useMemo(() => stopsOperativaSig(localStops), [localStops]);

  useEffect(() => {
    if (!active || !localServicio?.id || !stopsSig) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stopIds = localStops.map((s) => s.id).filter(Boolean);
        if (!stopIds.length) {
          if (!cancelled) setEvidenciasByStop({});
          return;
        }
        const grouped = await fetchEvidenciasGroupedByStop(stopIds, sbFetch);
        if (!cancelled) setEvidenciasByStop(grouped);
      } catch {
        if (!cancelled) setEvidenciasByStop({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, localServicio?.id, stopsSig, localStops]);

  useEffect(() => {
    if (!localServicio?.id) {
      setParticipacionResumen(null);
      return;
    }
    let cancelled = false;
    fetchParticipacionResumenServicio(localServicio.id)
      .then((res) => {
        if (!cancelled) setParticipacionResumen(res);
      })
      .catch(() => {
        if (!cancelled) setParticipacionResumen(null);
      });
    return () => {
      cancelled = true;
    };
  }, [localServicio?.id, items.length]);

  const timelineItems = useMemo(() => buildTimelineItems(localStops), [localStops]);
  const activeStopId = active?.stop?.id;
  const timelineItem = useMemo(
    () => timelineItems.find((it) => it.stop.id === activeStopId) || null,
    [timelineItems, activeStopId],
  );
  const firstCargaStopId = useMemo(() => {
    for (const item of timelineItems) {
      if (item.group === "carga") return item.stop.id;
    }
    return null;
  }, [timelineItems]);

  const operatingBusy = confirmMuelleSaving || descargaFirmaSaving || iniciarSaving;

  const elegibleFinalizarPorParadas = useMemo(() => {
    if (!localServicio?.id) return false;
    return finalizarServicios.some((sv) => sv.id === localServicio.id);
  }, [localServicio?.id, finalizarServicios]);

  const esUltimoActivoEnViaje = useMemo(() => {
    if (!participacionResumen || !uid) return false;
    return isConductorUltimoActivoEnServicio(participacionResumen.activeIds, uid);
  }, [participacionResumen, uid]);

  const puedeFinalizarParticipacion =
    elegibleFinalizarPorParadas &&
    !!participacionResumen &&
    participacionResumen.total > 1 &&
    !esUltimoActivoEnViaje;

  const canOperate =
    !detailReadOnly &&
    localServicio?.estado === "en_curso" &&
    !isStopOperationallyComplete(active?.stop) &&
    !operatingBusy;

  const handleEvidenciaSaved = useCallback((ev) => {
    const stopId = ev?.stop_id;
    if (!ev?.id || !stopId) return;
    setEvidenciasByStop((prev) => mergeEvidenciaIntoByStop(prev, stopId, ev));
  }, []);

  useEffect(() => {
    if (!evidenciasSeed) return;
    const t = setTimeout(() => setEvidenciasSeed(null), 800);
    return () => clearTimeout(t);
  }, [evidenciasSeed]);

  const handleMuelleRequest = ({ kind, stopId }) => {
    if (confirmMuelleSaving || operatingBusy) return;
    muelleGpsRef.current = null;
    setConfirmMuelle({ kind, stopId });
  };

  const handleConfirmMuelle = async () => {
    if (!confirmMuelle || confirmMuelleSaving || !localServicio) return;
    const { kind, stopId } = confirmMuelle;
    const stop = localStops.find((s) => s.id === stopId);
    const { eventType, actionLabel } = muelleActionMeta(kind, stop);
    setConfirmMuelleSaving(true);
    let prefetchedGps;
    try {
      prefetchedGps = await acquireLocation(eventType, actionLabel);
    } catch (error) {
      showToast?.(error?.message || "No se pudo obtener la ubicación");
      setConfirmMuelleSaving(false);
      return;
    }
    if (prefetchedGps === null) {
      setConfirmMuelleSaving(false);
      return;
    }
    muelleGpsRef.current = prefetchedGps;

    if (kind !== "entrada" && isDescargaStopTipo(stop?.tipo)) {
      setConfirmMuelle(null);
      setConfirmMuelleSaving(false);
      setDescargaFirma({
        stopId,
        prefetchedGps,
        stopLabel: active?.lugarDisplay || active?.lugar || stop?.nombre || "Descarga",
      });
      return;
    }

    try {
      const run =
        kind === "entrada"
          ? () => marcarLlegadoEn(localServicio, localStops, stopId, { prefetchedGps })
          : () => marcarCompletadoEn(localServicio, localStops, stopId, { prefetchedGps });
      const result = await withOperationTimeout(
        run(),
        45000,
        "La operación tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.",
      );
      if (result?.servicio) setLocalServicio(result.servicio);
      if (result?.stops) setLocalStops(result.stops);
      setConfirmMuelle(null);
      muelleGpsRef.current = null;
    } catch (error) {
      showToast?.(error?.message || "No se pudo registrar el muelle");
    } finally {
      setConfirmMuelleSaving(false);
    }
  };

  const handleConfirmDescargaFirma = async ({ firmaCanvas, comentario = "" } = {}) => {
    if (!descargaFirma || descargaFirmaSaving || !localServicio) return;
    if (!firmaCanvas) {
      showToast?.("Añade tu firma antes de completar la descarga");
      return;
    }
    const stop = localStops.find((s) => s.id === descargaFirma.stopId);
    if (!stop) {
      showToast?.("Parada no encontrada");
      setDescargaFirma(null);
      return;
    }
    setDescargaFirmaSaving(true);
    try {
      const firmaRes = await persistDescargaEntregaFirma({
        stop,
        servicioId: localServicio.id,
        firmaCanvas,
        comentario,
        conductorId: uid,
        conductorNombre,
        prefetchedGps: descargaFirma.prefetchedGps,
      });
      const stopsWithFirma = localStops.map((s) =>
        s.id === stop.id ? { ...s, notas: firmaRes.notas } : s,
      );
      setLocalStops(stopsWithFirma);
      const result = await withOperationTimeout(
        marcarCompletadoEn(localServicio, stopsWithFirma, descargaFirma.stopId, {
          prefetchedGps: descargaFirma.prefetchedGps,
        }),
        45000,
        "La operación tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.",
      );
      if (result?.servicio) setLocalServicio(result.servicio);
      if (result?.stops) setLocalStops(result.stops);
      const completedStop = (result?.stops || stopsWithFirma).find((s) => s.id === descargaFirma.stopId);
      setDescargaFirma(null);
      muelleGpsRef.current = null;
      showToast?.("Descarga completada con firma registrada", "#166534", 3200);
      setPostDescarga({
        stopId: stop.id,
        stopLabel: active?.tipoOrdenLabel || active?.tipoLabel || stop?.nombre || "Descarga",
        showDeca: showDcdtQuick,
      });
      if (completedStop) {
        setActive((prev) => (prev ? { ...prev, stop: completedStop } : prev));
      }
    } catch (error) {
      showToast?.(error?.message || "No se pudo guardar la firma de entrega");
    } finally {
      setDescargaFirmaSaving(false);
    }
  };

  const handleIniciarServicio = async () => {
    if (!localServicio?.id || iniciarSaving) return;
    setIniciarSaving(true);
    try {
      const prefetchedGps = await acquireLocation("inicio_servicio", "iniciar servicio");
      if (prefetchedGps === null) return;
      const next = await iniciarServicioEn(localServicio.id, {
        prefetchedGps,
        referenciaBase: localServicio.referencia ?? active?.servicio?.referencia ?? null,
      });
      setLocalServicio((prev) => ({ ...(prev || {}), ...next, id: localServicio.id }));
    } catch (error) {
      showToast?.(error?.message || "No se pudo iniciar el servicio");
    } finally {
      setIniciarSaving(false);
    }
  };

  const confirmStop = confirmMuelle ? localStops.find((s) => s.id === confirmMuelle.stopId) : null;

  if (loading && !active) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: DRIVER_UI.su, fontSize: 13, background: PAGE, minHeight: "70vh" }}>
        Cargando paradas...
      </div>
    );
  }

  if (active && timelineItem) {
    const servicioNoIniciado = localServicio?.estado === "asignado" || !localServicio?.fecha_inicio;
    const tripVis = active.tripVisual;
    return (
      <div style={{ padding: "0 0 88px", background: PAGE, minHeight: "70vh" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            background: "#fff",
            borderBottom: `1px solid ${DRIVER_UI.line}`,
            padding: "12px 14px 14px",
            borderLeft: tripVis ? `4px solid ${tripVis.stripe}` : undefined,
          }}
        >
          {detailReadOnly ? (
            <div
              style={{
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                color: "#0369a1",
                fontWeight: 600,
                marginBottom: 10,
                lineHeight: 1.4,
              }}
            >
              Solo consulta — no registras tiempos hasta que pulses EMPEZAR o CONTINUAR en la lista.
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <DriverStopCardHeader
                title={active.tipoOrdenLabel || active.tipoLabel || active.cardLine1 || "Parada"}
                referenciaCliente={active.referenciaCliente}
                tripServiceRef={active.tripServiceRef}
                tripVisual={tripVis}
                titleSize={17}
                showSubtitle={false}
              />
            </div>
            <button
              type="button"
              onClick={closeDetail}
              style={DRIVER_BACK_BUTTON_STYLE}
            >
              ← Volver
            </button>
          </div>

          {showDcdtQuick || showChatQuick ? (
            <div style={{ marginTop: 12 }}>
              <DriverQuickActionsBar
                showDcdt={showDcdtQuick}
                dcdtVisual={dcdtQuick.visual}
                onDcdtClick={() => setDcdtModalOpen(true)}
                showChat={showChatQuick}
                unreadCount={messagesUnread.unread}
                onChatClick={() => {
                  setChatModalOpen(true);
                  void messagesUnread.markRead();
                }}
              />
            </div>
          ) : null}
        </div>

        <div style={{ padding: "14px" }}>
          {servicioNoIniciado && !detailReadOnly ? (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 13,
                  color: "#92400e",
                  marginBottom: 10,
                  lineHeight: 1.45,
                }}
              >
                Este viaje aún no está iniciado. Pulsa para empezar antes de operar la parada.
              </div>
              <button
                type="button"
                disabled={iniciarSaving}
                onClick={handleIniciarServicio}
                style={{
                  width: "100%",
                  background: DRIVER_UI.green,
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: iniciarSaving ? "default" : "pointer",
                  opacity: iniciarSaving ? 0.7 : 1,
                }}
              >
                {iniciarSaving ? "Iniciando..." : "Iniciar servicio"}
              </button>
            </div>
          ) : null}

          <OperationalStopCard
            item={timelineItem}
            isCurrent
            isFirstCarga={timelineItem.stop.id === firstCargaStopId}
            evidencias={evidenciasByStop?.[timelineItem.stop.id]}
            canOperate={canOperate && !servicioNoIniciado}
            onConfirmMuelle={handleMuelleRequest}
            EvidenciasStopComponent={EvidenciasStopComponent}
            showToast={showToast}
            servicio={localServicio}
            servicioId={localServicio?.id}
            conductorNombre={conductorNombre}
            onEvidenciaSaved={handleEvidenciaSaved}
            acquireActionLocation={acquireLocation}
            driverDetailLayout
            operatingBusy={operatingBusy}
            initialEvidenciasModal={evidenciasSeed?.stopId === timelineItem.stop.id ? evidenciasSeed.modal : null}
            evidenciasFotoSource={evidenciasSeed?.stopId === timelineItem.stop.id ? evidenciasSeed.source : null}
          />

          <ConductorDropStopAction
            visible={!!active?.stop?.id && !!localServicio?.id && typeof soltarParadaEn === "function"}
            stopLabel={active?.tipoOrdenLabel || active?.tipoLabel || "esta parada"}
            disabled={operatingBusy}
            showToast={showToast}
            onConfirm={async () => {
              await soltarParadaEn(localServicio.id, active.stop.id);
              closeDetail();
            }}
          />

          <ConductorFinalizarParticipacionAction
            visible={puedeFinalizarParticipacion && typeof finalizarParticipacionEn === "function"}
            variant="inline"
            onConfirm={async () => {
              await finalizarParticipacionEn(localServicio.id);
              closeDetail();
            }}
            showToast={showToast}
            successMessage="Has terminado tu parte en este viaje"
          />

          {elegibleFinalizarPorParadas && esUltimoActivoEnViaje ? (
            <div
              style={{
                marginTop: 12,
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
              Eres el último conductor activo de este servicio. No puedes finalizar tu participación hasta que haya otro conductor asignado.
            </div>
          ) : null}
        </div>

        {confirmMuelle ? (
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
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 16, fontWeight: 800, color: DRIVER_UI.tx, marginBottom: 8 }}>
                {confirmMuelle.kind === "entrada" ? "Confirmar entrada en muelle" : "Confirmar salida de muelle"}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  disabled={confirmMuelleSaving}
                  onClick={() => setConfirmMuelle(null)}
                  style={{
                    flex: 1,
                    background: DRIVER_UI.surfaceHi,
                    border: `1px solid ${DRIVER_UI.line}`,
                    borderRadius: 12,
                    padding: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
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
                    cursor: "pointer",
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
        ) : null}

        <DriverLocationGateModal
          open={!!gate}
          phase={gate?.phase}
          actionLabel={gate?.actionLabel}
          error={gate?.error}
          onRetry={retry}
          onContinue={continueWithout}
          onCancel={cancelGate}
        />
        <DescargaEntregaFirmaModal
          open={!!descargaFirma}
          stopLabel={descargaFirma?.stopLabel || "Descarga"}
          saving={descargaFirmaSaving}
          onCancel={() => {
            if (descargaFirmaSaving) return;
            setDescargaFirma(null);
            muelleGpsRef.current = null;
          }}
          onConfirm={handleConfirmDescargaFirma}
        />

        <ConductorPostDescargaModal
          open={!!postDescarga}
          stopLabel={postDescarga?.stopLabel}
          busy={descargaFirmaSaving}
          showDeca={!!postDescarga?.showDeca}
          onClose={() => setPostDescarga(null)}
          onPod={() => {
            if (postDescarga?.stopId) {
              setEvidenciasSeed({ stopId: postDescarga.stopId, modal: "foto", source: "camera" });
            }
            setPostDescarga(null);
          }}
          onDeca={() => {
            setPostDescarga(null);
            setDcdtModalOpen(true);
          }}
          onSeguir={() => setPostDescarga(null)}
        />

        <DriverDcdtActionModal
          open={dcdtModalOpen}
          onClose={() => {
            setDcdtModalOpen(false);
            void dcdtQuick.reload();
          }}
          servicio={localServicio}
          empresa={empresaServicio}
          conductorUid={uid}
          stops={localStops}
          showToast={showToast}
        />
        <ServiceMessagesModal
          open={chatModalOpen}
          onClose={() => {
            setChatModalOpen(false);
            void messagesUnread.markRead();
            void messagesUnread.refresh();
          }}
          servicio={localServicio}
          senderName={conductorNombre}
          showToast={showToast}
          onMarkRead={messagesUnread.markRead}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 14px 88px", background: PAGE, minHeight: "70vh" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: DRIVER_UI.su, letterSpacing: 1.2, marginBottom: 12 }}>
        PARADAS PENDIENTES
      </div>

      {items.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: `1px dashed ${DRIVER_UI.line}`,
            borderRadius: 14,
            padding: "28px 18px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: DRIVER_UI.tx, marginBottom: 8 }}>Sin paradas pendientes</div>
          <div style={{ fontSize: 13, color: DRIVER_UI.su, lineHeight: 1.5 }}>
            No tienes operaciones de carga o descarga por hacer ahora.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item) => {
            const status = flatStopListStatus(item.stop);
            const enMuelle = status.phase === "en_muelle";
            const vis = item.tripVisual;
            const showEtaToFirstDescarga =
              firstDescargaStopIdByServicio.get(item.servicio?.id) === item.stop?.id;
            const etaVisual = showEtaToFirstDescarga
              ? resolveEtaVisual(item.servicio, new Date(etaClockMs))
              : null;
            const etaLabel =
              etaVisual?.tier === "operational"
                ? etaVisual.operational?.eta_label || etaVisual.operational?.label
                : etaVisual?.tier === "plan"
                  ? etaVisual.etaLabel
                  : null;
            const cardShowDeca = !!item.servicio?.empresa_id && isDecaAplicable(item.servicio);
            return (
            <article
              key={`${item.servicio?.id}-${item.stop?.id}`}
              style={{
                position: "relative",
                background: enMuelle ? "#fffbeb" : "#fff",
                border: `1px solid ${enMuelle ? "#fcd34d" : DRIVER_UI.line}`,
                borderRadius: 14,
                padding: "14px 14px 14px 16px",
                boxShadow: enMuelle ? "0 2px 10px rgba(180,83,9,.08)" : "0 2px 8px rgba(15,23,42,.04)",
                overflow: "hidden",
              }}
            >
              {vis ? (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 5,
                    background: vis.stripe,
                  }}
                />
              ) : null}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 24, marginLeft: 2 }} aria-hidden>
                  {stopGroupIcon(item.tipoLabel)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DriverStopCardHeader
                    title={item.tipoOrdenLabel || item.tipoLabel || item.cardLine1 || "Parada"}
                    subtitle={item.cardLine2 || item.lugarDisplay || item.lugar || "—"}
                    referenciaCliente={item.referenciaCliente}
                    tripServiceRef={item.tripServiceRef}
                    tripVisual={vis}
                    statusLabel={status.label}
                    statusEnMuelle={enMuelle}
                  />
                  {showEtaToFirstDescarga && etaLabel ? (
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", marginTop: 8 }}>
                      ETA primera descarga: {etaLabel}
                    </div>
                  ) : null}
                  {cardShowDeca ? (
                    <div style={{ marginTop: 10 }}>
                      <DriverQuickActionsBar
                        showDcdt
                        dcdtVisual="none"
                        onDcdtClick={() => setListDcdtServicioId(item.servicio.id)}
                        showChat={false}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => handleOpenItem(item, { readOnly: false })}
                  style={{
                    flex: 2,
                    background: enMuelle ? DRIVER_UI.amber : DRIVER_UI.green,
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "14px 10px",
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: "pointer",
                    letterSpacing: 0.3,
                  }}
                >
                  {status.actionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenItem(item, { readOnly: true })}
                  style={{
                    flex: 1,
                    background: "#fff",
                    color: DRIVER_UI.su,
                    border: `1px solid ${DRIVER_UI.line}`,
                    borderRadius: 12,
                    padding: "14px 8px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    lineHeight: 1.25,
                  }}
                >
                  Ver detalles
                </button>
              </div>
            </article>
            );
          })}
        </div>
      )}

      <DriverDcdtActionModal
        open={!!listDcdtServicioId && !active}
        onClose={() => {
          setListDcdtServicioId(null);
          void listDcdtQuick.reload();
        }}
        servicio={listDcdtItem?.servicio ?? null}
        empresa={listDcdtEmpresa}
        conductorUid={uid}
        stops={listDcdtItem?.stops ?? NO_STOPS}
        showToast={showToast}
      />

      {orderSkipConfirm ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.4)",
            zIndex: 420,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setOrderSkipConfirm(null)}
        >
          <div
            role="dialog"
            aria-labelledby="order-skip-title"
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "20px 18px",
              maxWidth: 400,
              width: "100%",
              border: `1px solid ${DRIVER_UI.line}`,
              boxShadow: "0 12px 40px rgba(15,23,42,.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div id="order-skip-title" style={{ fontSize: 16, fontWeight: 800, color: DRIVER_UI.tx, marginBottom: 10 }}>
              Orden de paradas
            </div>
            <p style={{ fontSize: 14, color: DRIVER_UI.su, lineHeight: 1.5, margin: "0 0 16px" }}>
              Vas a atender esta parada antes que{" "}
              <strong style={{ color: DRIVER_UI.tx }}>{orderSkipConfirm.earlierLabel}</strong>. ¿Continuar?
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setOrderSkipConfirm(null)}
                style={{
                  flex: 1,
                  background: DRIVER_UI.surfaceHi,
                  color: DRIVER_UI.su,
                  border: `1px solid ${DRIVER_UI.line}`,
                  borderRadius: 12,
                  padding: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = orderSkipConfirm.item;
                  setOrderSkipConfirm(null);
                  openItem(pending, { readOnly: false });
                }}
                style={{
                  flex: 1,
                  background: DRIVER_UI.amber,
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
