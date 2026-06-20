import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OperationalStopCard,
  buildTimelineItems,
  DRIVER_UI,
} from "./ActiveServicePanel.jsx";
import { DriverLocationGateModal } from "./DriverLocationGateModal.jsx";
import { DriverQuickActionsBar } from "./ServiceQuickActionsBar.jsx";
import { DriverDcdtActionModal } from "./DriverDcdtActionModal.jsx";
import { ServiceMessagesModal } from "./ServiceMessagesModal.jsx";
import { useDriverFlatPendingStops } from "../hooks/useDriverFlatPendingStops.js";
import { useDriverActionLocation } from "../hooks/useDriverActionLocation.js";
import { useConductorDcdtQuickStatus } from "../hooks/useConductorDcdtQuickStatus.js";
import { useServiceMessagesUnread } from "../hooks/useServiceMessagesUnread.js";
import { useEmpresaOriginLookup } from "../../../hooks/useEmpresaOriginLookup.js";
import { isServiceMessagesEnabled } from "../../../config/serviceMessages.js";
import { fetchEvidenciasGroupedByStop } from "../../../domain/service/serviceDocuments.js";
import { mergeEvidenciaIntoByStop } from "../../../domain/documents/operationalEvidenciaSync.js";
import { stopsOperativaSig } from "../../../features/empresa/empresaFlotaRefresh.js";
import { isStopOperationallyComplete } from "../../../domain/service/serviceStops.js";
import { getServiceNumberForDisplay } from "../../../domain/service/serviceIdentity.js";
import { sbFetch } from "../../../data/supabaseClient.js";
import { tripLabelForServicio } from "../../../domain/service/driverFlatStopList.js";
import { useAutoOperationalEtaToFirstDescarga } from "../hooks/useAutoOperationalEtaToFirstDescarga.js";
import {
  getFirstPendingDescargaStop,
  hasCompletedDescargaStop,
} from "../../../domain/service/operationalEtaAutoRefresh.js";
import { resolveEtaVisual } from "../../../domain/service/operationalEtaPresentation.js";
import { useEtaVisualClockMs } from "../../../domain/service/useEtaVisualClock.js";

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
  finalizarParticipacionEn,
  recalculateOperationalRoute,
  EvidenciasStopComponent,
}) {
  const { loading, items, finalizarServicios, reload } = useDriverFlatPendingStops(uid);
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
  const [finalizarSavingId, setFinalizarSavingId] = useState(null);
  const [dcdtModalOpen, setDcdtModalOpen] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const muelleGpsRef = useRef(null);
  const { gate, acquireLocation, retry, continueWithout, cancelGate } = useDriverActionLocation();

  const detailServicio = active ? localServicio : null;
  const detailStops = active ? localStops : NO_STOPS;
  const serviciosForEmpresaLookup = useMemo(
    () => (detailServicio ? [detailServicio] : NO_SERVICIOS),
    [detailServicio],
  );
  const empresaById = useEmpresaOriginLookup(serviciosForEmpresaLookup);
  const empresaServicio = detailServicio?.empresa_id ? empresaById[detailServicio.empresa_id] : null;
  const showDcdtQuick = !!detailServicio?.empresa_id;
  const showChatQuick = isServiceMessagesEnabled(detailServicio);
  const dcdtQuick = useConductorDcdtQuickStatus({
    servicio: detailServicio,
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

  const closeDetail = useCallback(() => {
    setActive(null);
    setLocalServicio(null);
    setLocalStops([]);
    setConfirmMuelle(null);
    setDcdtModalOpen(false);
    setChatModalOpen(false);
    setDetailReadOnly(false);
    void reload();
  }, [reload]);

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

  const canOperate =
    !detailReadOnly &&
    localServicio?.estado === "en_curso" &&
    !isStopOperationallyComplete(active?.stop);

  const handleEvidenciaSaved = useCallback((ev) => {
    const stopId = ev?.stop_id;
    if (!ev?.id || !stopId) return;
    setEvidenciasByStop((prev) => mergeEvidenciaIntoByStop(prev, stopId, ev));
  }, []);

  const handleMuelleRequest = ({ kind, stopId }) => {
    if (confirmMuelleSaving) return;
    muelleGpsRef.current = null;
    setConfirmMuelle({ kind, stopId });
  };

  const handleConfirmMuelle = async () => {
    if (!confirmMuelle || confirmMuelleSaving || !localServicio) return;
    const { kind, stopId } = confirmMuelle;
    const stop = localStops.find((s) => s.id === stopId);
    const { eventType, actionLabel } = muelleActionMeta(kind, stop);
    const prefetchedGps = await acquireLocation(eventType, actionLabel);
    if (prefetchedGps === null) return;
    muelleGpsRef.current = prefetchedGps;
    setConfirmMuelleSaving(true);
    try {
      const result =
        kind === "entrada"
          ? await marcarLlegadoEn(localServicio, localStops, stopId, { prefetchedGps })
          : await marcarCompletadoEn(localServicio, localStops, stopId, { prefetchedGps });
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

  const handleIniciarServicio = async () => {
    if (!localServicio?.id || iniciarSaving) return;
    setIniciarSaving(true);
    try {
      const prefetchedGps = await acquireLocation("inicio_servicio", "iniciar servicio");
      if (prefetchedGps === null) return;
      const next = await iniciarServicioEn(localServicio.id, { prefetchedGps });
      setLocalServicio((prev) => ({ ...(prev || {}), ...next, id: localServicio.id }));
    } catch (error) {
      showToast?.(error?.message || "No se pudo iniciar el servicio");
    } finally {
      setIniciarSaving(false);
    }
  };

  const handleFinalizarParticipacion = async (servicioId) => {
    if (!servicioId || finalizarSavingId) return;
    setFinalizarSavingId(servicioId);
    try {
      await finalizarParticipacionEn(servicioId);
      showToast?.("Has terminado tu parte en este viaje");
      void reload();
    } catch (error) {
      showToast?.(error?.message || "No se pudo finalizar tu participación");
    } finally {
      setFinalizarSavingId(null);
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
    const lugarTitulo = active.lugarDisplay || active.lugar || timelineItem.label || "Parada";
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
              <div style={{ fontSize: 11, fontWeight: 800, color: "#b45309", letterSpacing: 0.5, marginBottom: 6 }}>
                {active.tipoLabel} · {tripLabelForServicio(localServicio)}
              </div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: DRIVER_UI.tx,
                  lineHeight: 1.2,
                  margin: 0,
                  wordBreak: "break-word",
                }}
              >
                {lugarTitulo}
              </h1>
            </div>
            <button
              type="button"
              onClick={closeDetail}
              style={{
                flexShrink: 0,
                background: DRIVER_UI.surfaceHi,
                color: DRIVER_UI.su,
                border: `1px solid ${DRIVER_UI.line}`,
                borderRadius: 10,
                padding: "9px 12px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
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
                  messagesUnread.markRead();
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
          />
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
            messagesUnread.markRead();
            void messagesUnread.refresh();
          }}
          servicio={localServicio}
          senderName={conductorNombre}
          showToast={showToast}
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
            const ref = getServiceNumberForDisplay(item.servicio);
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#b45309", letterSpacing: 0.4 }}>{item.tipoLabel}</div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        color: enMuelle ? "#b45309" : DRIVER_UI.su,
                        background: enMuelle ? "#fef3c7" : DRIVER_UI.surfaceHi,
                        border: `1px solid ${enMuelle ? "#fcd34d" : DRIVER_UI.line}`,
                      }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: DRIVER_UI.tx, marginTop: 5, lineHeight: 1.25 }}>
                    {item.lugarDisplay || item.lugar}
                  </div>
                  {showEtaToFirstDescarga && etaLabel ? (
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", marginTop: 8 }}>
                      ETA primera descarga: {etaLabel}
                    </div>
                  ) : null}
                  {vis ? (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 8,
                        background: vis.chipBg,
                        border: `1px solid ${vis.stripe}33`,
                        borderRadius: 999,
                        padding: "4px 10px 4px 4px",
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: vis.stripe,
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 900,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {vis.initial}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: vis.chipFg, lineHeight: 1.2 }}>
                        {ref}
                        {item.conductorNombre ? ` · ${item.conductorNombre}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: DRIVER_UI.su, marginTop: 6, fontWeight: 600 }}>{item.tripLabel}</div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => openItem(item, { readOnly: false })}
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
                  onClick={() => openItem(item, { readOnly: true })}
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

      {finalizarServicios.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: DRIVER_UI.su, marginBottom: 10 }}>PARTICIPACIÓN</div>
          {finalizarServicios.map((sv) => (
            <button
              key={sv.id}
              type="button"
              disabled={finalizarSavingId === sv.id}
              onClick={() => handleFinalizarParticipacion(sv.id)}
              style={{
                width: "100%",
                marginBottom: 8,
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid rgba(185,28,28,.25)",
                borderRadius: 12,
                padding: "14px",
                fontSize: 14,
                fontWeight: 800,
                cursor: finalizarSavingId === sv.id ? "default" : "pointer",
                opacity: finalizarSavingId === sv.id ? 0.7 : 1,
              }}
            >
              {finalizarSavingId === sv.id
                ? "Finalizando..."
                : `HE TERMINADO MI PARTE · ${getServiceNumberForDisplay(sv)}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
