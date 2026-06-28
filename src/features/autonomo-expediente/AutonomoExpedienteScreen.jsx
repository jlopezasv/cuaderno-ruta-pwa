import { useCallback, useEffect, useState } from "react";
import { ESTADO_LABEL } from "../../domain/fleet/serviceStatus.js";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { geoPayloadFromLocationResult } from "../../data/driverActionGps.js";
import { OperationalEvidenciasStop } from "../documents/OperationalEvidenciasStop.jsx";
import { ServiceExtraDocumentsBlock } from "../services/components/ServiceExtraDocumentsBlock.jsx";
import { DriverLocationGateModal } from "../services/components/DriverLocationGateModal.jsx";
import { useDriverActionLocation } from "../services/hooks/useDriverActionLocation.js";
import { OperationalSummaryLite } from "../../modules/operational-lite/OperationalSummaryLite.jsx";
import {
  createAutonomoExpediente,
  fetchAutonomoExpedientes,
  loadAutonomoExpedienteWorkspace,
  registerCargaOnExpediente,
  addDestinoOnExpediente,
  updateDestinoEstado,
  generarExpedienteAutonomo,
  generarDecaCargaExpediente,
  terminarCargaMuelle,
  updateCargaMercancia,
  setExpedientePdfVisibility,
  archiveAutonomoExpediente,
} from "../../modules/autonomo-expediente/autonomoExpedienteApi.js";
import { loadArchivedAutonomoExpedienteIds } from "../../modules/autonomo-expediente/autonomoExpedienteArchive.js";
import { isIncludedInExpedientePdf, getExpedienteDecaLinks } from "../../modules/autonomo-expediente/autonomoExpedienteMeta.js";
import { getCargaAlcance, isCargaNacional } from "../../modules/autonomo-expediente/autonomoExpedienteDeca.js";
import {
  buildExpedienteOperativoState,
  cargaNeedsDeca,
  decaLinkForCarga,
} from "../../modules/autonomo-expediente/autonomoExpedienteUiModel.js";
import {
  getCargaMuelleResumen,
  getDestinoTiempoResumen,
  isCargaEnMuelle,
  isCargaTerminada,
  isRetornoCarga,
} from "../../modules/autonomo-expediente/autonomoExpedienteStopModel.js";
import { SERVICIO_ALCANCE_LABELS } from "../../domain/service/servicioAlcance.js";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { AutonomoRegistrarCargaModal } from "./AutonomoRegistrarCargaModal.jsx";
import { AutonomoDocAccionesModal, docActionToEvidenciaConfig } from "./AutonomoDocAccionesModal.jsx";
import { AutonomoDestinoModal } from "./AutonomoDestinoModal.jsx";
import { AutonomoGenerarExpedienteModal } from "./AutonomoGenerarExpedienteModal.jsx";
import { AutonomoExpedienteDecaBlock } from "./AutonomoExpedienteDecaBlock.jsx";
import { AutonomoCargaEnMuelleModal } from "./AutonomoCargaEnMuelleModal.jsx";
import { AutonomoGenerarDecaModal } from "./AutonomoGenerarDecaModal.jsx";
import { AutonomoPostEntregaModal } from "./AutonomoPostEntregaModal.jsx";

const UI = {
  page: "#f8fafc",
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#15803d",
  blue: "#2563eb",
  amber: "#b45309",
};

function bigBtn(color, disabled = false) {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: color,
    color: "#fff",
    fontSize: 14,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

function actionChip(color = UI.blue) {
  return {
    flex: "1 1 45%",
    minWidth: 140,
    padding: "11px 12px",
    borderRadius: 12,
    border: color === "#fff" ? `1px solid ${UI.line}` : "none",
    background: color === "#fff" ? "#fff" : color,
    color: color === "#fff" ? UI.tx : "#fff",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "left",
  };
}

function Card({ title, children, style = {} }) {
  return (
    <div
      style={{
        background: UI.card,
        border: `1px solid ${UI.line}`,
        borderRadius: 14,
        padding: "12px 14px",
        marginBottom: 12,
        ...style,
      }}
    >
      {title ? (
        <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, letterSpacing: 0.6, marginBottom: 10 }}>
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function destinoEstadoChip(estado) {
  const st = String(estado || "pendiente").toLowerCase();
  if (st === "entregado") return { bg: "#dcfce7", color: "#166534", label: "Entregado" };
  if (st === "incidencia") return { bg: "#fef3c7", color: UI.amber, label: "Incidencia" };
  return { bg: "#f1f5f9", color: UI.su, label: "Pendiente" };
}

function miniBtn(bg = null) {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: `1px solid ${UI.line}`,
    background: bg || UI.page,
    color: bg ? "#fff" : UI.tx,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  };
}

export function AutonomoExpedienteScreen({ uid, profile = {}, conductorNombre = "Conductor", showToast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expedientes, setExpedientes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [view, setView] = useState("home");
  const [cargaModal, setCargaModal] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [destinoModal, setDestinoModal] = useState(false);
  const [focusStop, setFocusStop] = useState(null);
  const [evidenciaTipos, setEvidenciaTipos] = useState(null);
  const [generarModal, setGenerarModal] = useState(false);
  const [cargaEnMuelleModal, setCargaEnMuelleModal] = useState(null);
  const [decaModalCarga, setDecaModalCarga] = useState(null);
  const [postEntregaDestino, setPostEntregaDestino] = useState(null);
  const [retornoDesdeStopId, setRetornoDesdeStopId] = useState(null);
  const [showMasMenu, setShowMasMenu] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => loadArchivedAutonomoExpedienteIds(uid));
  const [showArchived, setShowArchived] = useState(false);
  const [archiveConfirmId, setArchiveConfirmId] = useState(null);

  const { gate, acquireLocation, retry, continueWithout, cancelGate } = useDriverActionLocation();

  const reloadList = useCallback(async () => {
    if (!uid) {
      setExpedientes([]);
      return;
    }
    const list = await fetchAutonomoExpedientes(uid);
    setExpedientes(list);
  }, [uid]);

  const reloadWorkspace = useCallback(async (id) => {
    const sid = id || activeId;
    if (!sid) {
      setWorkspace(null);
      return;
    }
    const ws = await loadAutonomoExpedienteWorkspace(sid);
    setWorkspace(ws);
  }, [activeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reloadList();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadList]);

  useEffect(() => {
    if (activeId) void reloadWorkspace(activeId);
  }, [activeId, reloadWorkspace]);

  useEffect(() => {
    const onReload = () => {
      void reloadList();
      if (activeId) void reloadWorkspace(activeId);
    };
    window.addEventListener("cuaderno-recargar-servicio", onReload);
    window.addEventListener("cuaderno:evidencia-saved", onReload);
    return () => {
      window.removeEventListener("cuaderno-recargar-servicio", onReload);
      window.removeEventListener("cuaderno:evidencia-saved", onReload);
    };
  }, [activeId, reloadList, reloadWorkspace]);

  async function handleNuevoExpediente() {
    setBusy(true);
    try {
      const row = await createAutonomoExpediente(uid, { profile });
      setActiveId(row.id);
      setView("workspace");
      await reloadList();
      await reloadWorkspace(row.id);
      showToast?.("Expediente iniciado");
    } catch (e) {
      showToast?.(e?.message || "Error al crear expediente");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegistrarCarga(payload) {
    if (!activeId || !payload?.almacen) return;
    setBusy(true);
    try {
      let geoEntrada = null;
      try {
        const loc = await acquireLocation("entrada_muelle", "Llegada al muelle");
        if (loc?.ok) geoEntrada = geoPayloadFromLocationResult(loc);
      } catch {
        /* GPS opcional */
      }
      const { stop } = await registerCargaOnExpediente({
        servicioId: activeId,
        uid,
        almacen: payload.almacen,
        alcance: payload.alcance,
        mercancia: payload.mercancia,
        geoEntrada,
        esRetorno: payload.esRetorno,
        retornoDesdeStopId: payload.retornoDesdeStopId,
        requiereDeca: payload.requiereDeca,
      });
      setCargaModal(false);
      setRetornoDesdeStopId(null);
      await reloadWorkspace(activeId);
      setCargaEnMuelleModal(stop);
      showToast?.("Carga registrada · en muelle");
    } catch (e) {
      showToast?.(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddDestino(destino) {
    if (!activeId) return;
    setBusy(true);
    try {
      await addDestinoOnExpediente({ servicioId: activeId, uid, destino });
      setDestinoModal(false);
      await reloadWorkspace(activeId);
      showToast?.("Destino añadido");
    } catch (e) {
      showToast?.(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDestinoLlegada(stop) {
    setBusy(true);
    try {
      const loc = await acquireLocation("entrada_muelle", "Llegada al destino");
      if (!loc?.ok) return;
      const geo = geoPayloadFromLocationResult(loc);
      await updateDestinoEstado({
        stopId: stop.id,
        servicioId: activeId,
        estado: getStopOperacionMeta(stop.notas).destino_estado || "pendiente",
        geo: { entrada: geo },
      });
      await reloadWorkspace(activeId);
      showToast?.("Llegada registrada");
    } catch (e) {
      showToast?.(e?.message || "Error GPS");
    } finally {
      setBusy(false);
    }
  }

  async function handleDestinoSalida(stop) {
    setBusy(true);
    try {
      const loc = await acquireLocation("salida_muelle", "Salida del destino");
      if (!loc?.ok) return;
      const geo = geoPayloadFromLocationResult(loc);
      await updateDestinoEstado({
        stopId: stop.id,
        servicioId: activeId,
        estado: "entregado",
        geo: { salida: geo },
      });
      await reloadWorkspace(activeId);
      setPostEntregaDestino(stop);
      showToast?.("Descarga completada");
    } catch (e) {
      showToast?.(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleTerminarCargaMuelle(cargaStop) {
    setBusy(true);
    try {
      let geo = null;
      try {
        const loc = await acquireLocation("salida_muelle", "Salida del muelle");
        if (loc?.ok) geo = geoPayloadFromLocationResult(loc);
      } catch {
        /* GPS opcional */
      }
      await terminarCargaMuelle({ stopId: cargaStop.id, servicioId: activeId, geo });
      await reloadWorkspace(activeId);
      showToast?.("Carga terminada");
    } catch (e) {
      showToast?.(e?.message || "Error");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerarDeca({ transportista, conductor, cargaStopId }) {
    if (!activeId) return;
    setBusy(true);
    try {
      await generarDecaCargaExpediente({
        servicioId: activeId,
        cargaStopId,
        workspace,
        profile,
        uid,
        transportista,
        conductor,
      });
      setDecaModalCarga(null);
      await reloadWorkspace(activeId);
      showToast?.(`${DECA_SHORT_LABEL} generado`);
    } catch (e) {
      showToast?.(e?.message || "Error DeCA");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setArchivedIds(loadArchivedAutonomoExpedienteIds(uid));
  }, [uid, expedientes.length]);

  const visibleExpedientes = expedientes.filter((ex) => {
    const archived = archivedIds.has(ex.id);
    return showArchived ? archived : !archived;
  });

  async function handleArchivarExpediente(servicioId) {
    if (!servicioId || !uid) return;
    setBusy(true);
    try {
      await archiveAutonomoExpediente(servicioId, uid);
      setArchivedIds(loadArchivedAutonomoExpedienteIds(uid));
      setArchiveConfirmId(null);
      if (activeId === servicioId) {
        setActiveId(null);
        setView("home");
        setWorkspace(null);
      }
      await reloadList();
      showToast?.("Expediente archivado");
    } catch (e) {
      showToast?.(e?.message || "No se pudo archivar");
    } finally {
      setBusy(false);
    }
  }

  function renderArchiveConfirm(servicioId) {
    if (archiveConfirmId !== servicioId) return null;
    return (
      <div
        style={{
          marginTop: 8,
          padding: "10px 12px",
          borderRadius: 10,
          background: "#fef2f2",
          border: "1px solid #fecaca",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 12, color: UI.tx, marginBottom: 8, lineHeight: 1.4 }}>
          ¿Archivar este expediente? Se ocultará de la lista pero conservarás PDF y datos.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleArchivarExpediente(servicioId)}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: "#b91c1c",
              color: "#fff",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Sí, archivar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setArchiveConfirmId(null)}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${UI.line}`,
              background: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  async function handleGenerarExpediente({ transportista, conductor, comentario, firmaCanvas }) {
    if (!activeId || !workspace?.servicio) return;
    setBusy(true);
    try {
      const result = await generarExpedienteAutonomo({
        servicio: workspace.servicio,
        workspace,
        profile,
        uid,
        transportista,
        conductor,
        firmaCanvas,
        comentario,
        conductorNombre: conductor?.nombre || conductorNombre,
      });
      setGenerarModal(false);
      await reloadList();
      const ws = await loadAutonomoExpedienteWorkspace(activeId);
      setWorkspace(ws);
      setView("resumen");
      if (result?.decas?.length) {
        showToast?.(`Expediente finalizado · ${result.decas.length} DeCA incluidos`);
      } else {
        showToast?.("Expediente finalizado");
      }
    } catch (e) {
      showToast?.(e?.message || "Error");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  function handleDocAction(action) {
    const cfg = docActionToEvidenciaConfig(action);
    setEvidenciaTipos(cfg.tipos);
    setDocModal(false);
  }

  async function togglePdfInclude(kind, id, current) {
    if (!activeId) return;
    await setExpedientePdfVisibility(activeId, kind, id, !current);
    await reloadWorkspace(activeId);
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: UI.su, background: UI.page, minHeight: "60vh" }}>
        Cargando…
      </div>
    );
  }

  if (view === "resumen" && workspace?.servicio) {
    return (
      <div style={{ padding: "14px 14px 88px", background: UI.page }}>
        <button
          type="button"
          onClick={() => setView("home")}
          style={{ background: "transparent", border: "none", color: UI.blue, fontWeight: 800, marginBottom: 12, cursor: "pointer" }}
        >
          ← Expedientes
        </button>
        <OperationalSummaryLite servicio={workspace.servicio} conductorNombre={conductorNombre} showToast={showToast} />
        <AutonomoExpedienteDecaBlock servicio={workspace.servicio} showToast={showToast} />
        {String(workspace.servicio.estado || "").toLowerCase() === "completado" ? (
          <div style={{ marginTop: 16 }}>
            {archiveConfirmId === workspace.servicio.id ? (
              renderArchiveConfirm(workspace.servicio.id)
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setArchiveConfirmId(workspace.servicio.id)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1px solid ${UI.line}`,
                  background: "#fff",
                  color: UI.su,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Archivar expediente
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  if (view === "home" || !activeId) {
    const active = expedientes.find((e) => {
      if (archivedIds.has(e.id)) return false;
      const st = String(e.estado || "").toLowerCase();
      return st === "en_curso" || st === "asignado";
    });
    return (
      <div style={{ padding: "14px 14px 88px", background: UI.page, minHeight: "70vh" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, letterSpacing: 1.1, marginBottom: 6 }}>
          EXPEDIENTE OPERACIONAL
        </div>
        <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.5, marginBottom: 16 }}>
          Construye el expediente sobre la marcha. Sin formularios previos.
        </div>

        <button type="button" style={bigBtn(UI.green, busy)} disabled={busy} onClick={handleNuevoExpediente}>
          + NUEVO EXPEDIENTE
        </button>

        {active ? (
          <button
            type="button"
            style={{
              ...bigBtn(UI.blue, false),
              background: "#fff",
              color: UI.blue,
              border: `2px solid ${UI.blue}`,
            }}
            onClick={() => {
              setActiveId(active.id);
              setView("workspace");
            }}
          >
            Continuar expediente en curso
          </button>
        ) : null}

        {expedientes.length ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: UI.su }}>
                {showArchived ? "ARCHIVADOS" : "RECIENTES"}
              </div>
              {archivedIds.size ? (
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: UI.blue,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {showArchived ? "Ver activos" : `Ver archivados (${archivedIds.size})`}
                </button>
              ) : null}
            </div>
            {visibleExpedientes.slice(0, 8).map((ex) => (
              <div key={ex.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(ex.id);
                    setView(String(ex.estado).toLowerCase() === "completado" ? "resumen" : "workspace");
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: UI.card,
                    border: `1px solid ${UI.line}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 800, color: UI.tx }}>
                        {new Date(ex.fecha_inicio || ex.created_at).toLocaleDateString("es-ES")}
                      </div>
                      <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
                        {ESTADO_LABEL[String(ex.estado || "").toLowerCase()] || ex.estado}
                      </div>
                    </div>
                    {!showArchived && String(ex.estado || "").toLowerCase() === "completado" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setArchiveConfirmId((cur) => (cur === ex.id ? null : ex.id));
                        }}
                        style={{
                          flexShrink: 0,
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: `1px solid ${UI.line}`,
                          background: UI.page,
                          color: UI.su,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Archivar
                      </button>
                    ) : null}
                  </div>
                </button>
                {renderArchiveConfirm(ex.id)}
              </div>
            ))}
            {!visibleExpedientes.length ? (
              <div style={{ fontSize: 13, color: UI.su, textAlign: "center", padding: 12 }}>
                {showArchived ? "No hay expedientes archivados." : "No hay expedientes recientes."}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const { servicio, cargas, destinos, timeline, evidenciasByStop, stops } = workspace || {};
  const focusStopRow = focusStop?.id ? stops?.find((s) => s.id === focusStop.id) || focusStop : focusStop;
  const cargaEnMuelleRow = cargaEnMuelleModal?.id
    ? stops?.find((s) => s.id === cargaEnMuelleModal.id) || cargaEnMuelleModal
    : null;
  const decaModalCargaRow = decaModalCarga?.id
    ? stops?.find((s) => s.id === decaModalCarga.id) || decaModalCarga
    : null;
  const operativo = buildExpedienteOperativoState({ servicio, cargas: cargas || [], destinos: destinos || [] });

  return (
    <div style={{ padding: "14px 14px 88px", background: UI.page, minHeight: "70vh" }}>
      <DriverLocationGateModal
        open={!!gate}
        phase={gate?.phase}
        actionLabel={gate?.actionLabel}
        error={gate?.error}
        onRetry={retry}
        onContinueWithout={continueWithout}
        onCancel={cancelGate}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, letterSpacing: 1.1 }}>DIARIO OPERATIVO</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: UI.tx, marginTop: 4 }}>
            {servicio?.fecha_inicio
              ? new Date(servicio.fecha_inicio).toLocaleString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Expediente activo"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowMasMenu((v) => !v)}
            style={{
              background: UI.card,
              border: `1px solid ${UI.line}`,
              borderRadius: 10,
              padding: "8px 12px",
              color: UI.tx,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Más
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveId(null);
              setView("home");
            }}
            style={{ background: "transparent", border: "none", color: UI.su, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Salir
          </button>
        </div>
      </div>

      <Card title="ESTADO ACTUAL">
        <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx }}>{operativo.estadoLabel}</div>
        {operativo.sugerencias.slice(0, 2).map((s) => (
          <div key={s.id} style={{ fontSize: 13, color: UI.blue, marginTop: 8, fontWeight: 700 }}>
            → {s.label}
          </div>
        ))}
      </Card>

      <Card title="ACCIONES RÁPIDAS">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" style={actionChip("#0f766e")} disabled={busy} onClick={() => setCargaModal(true)}>
            Registrar carga
          </button>
          <button type="button" style={actionChip(UI.blue)} disabled={busy} onClick={() => setDestinoModal(true)}>
            Añadir destino
          </button>
          <button type="button" style={actionChip("#64748b")} disabled={busy} onClick={() => setDocModal(true)}>
            Documentación / OCR
          </button>
          <button
            type="button"
            style={actionChip("#fff")}
            disabled={busy}
            onClick={() => {
              const target = cargas?.[cargas.length - 1] || destinos?.[destinos.length - 1];
              if (target) {
                setFocusStop(target);
                setEvidenciaTipos(["incidencia"]);
              } else showToast?.("Registra una carga o destino primero");
            }}
          >
            Incidencia
          </button>
        </div>
      </Card>

      {showMasMenu || operativo.canSuggestFinalizar ? (
        <Card title="MÁS">
          <button
            type="button"
            disabled={busy}
            onClick={() => setGenerarModal(true)}
            style={{
              width: "100%",
              padding: "11px 12px",
              borderRadius: 10,
              border: `1px solid ${UI.line}`,
              background: operativo.canSuggestFinalizar ? "#f1f5f9" : UI.page,
              color: UI.su,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Finalizar expediente
          </button>
        </Card>
      ) : null}

      {cargas?.length ? (
        <Card title="CARGAS">
          {cargas.map((c) => {
            const alcance = getCargaAlcance(c);
            const muelle = getCargaMuelleResumen(c);
            const terminada = isCargaTerminada(c);
            const enMuelle = isCargaEnMuelle(c);
            const decaLink = decaLinkForCarga(servicio, c.id);
            const needsDeca = cargaNeedsDeca(c, servicio);
            return (
              <div
                key={c.id}
                style={{
                  border: `1px solid ${UI.line}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 800, color: UI.tx }}>
                      {c.nombre}
                      {isRetornoCarga(c) ? " · retorno" : ""}
                    </div>
                    <div style={{ fontSize: 12, color: UI.su, marginTop: 2 }}>
                      {SERVICIO_ALCANCE_LABELS[alcance] || alcance}
                      {enMuelle ? " · en muelle" : terminada && muelle.label ? ` · ${muelle.label}` : ""}
                    </div>
                  </div>
                  {decaLink ? (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "#dcfce7", color: UI.green }}>
                      DeCA
                    </span>
                  ) : needsDeca ? (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "#fef3c7", color: UI.amber }}>
                      DeCA pendiente
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setCargaEnMuelleModal(c)}
                    style={miniBtn()}
                  >
                    {terminada ? "Ver carga" : "Terminar carga"}
                  </button>
                  {needsDeca && isCargaNacional(c) ? (
                    <button type="button" disabled={busy} onClick={() => setDecaModalCarga(c)} style={miniBtn(UI.green)}>
                      Generar DeCA
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setFocusStop(c);
                      setEvidenciaTipos(["cmr", "foto"]);
                    }}
                    style={miniBtn()}
                  >
                    Docs
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      ) : null}

      {destinos?.length ? (
        <Card title="DESTINOS">
          {destinos.map((d) => {
            const meta = getStopOperacionMeta(d.notas);
            const chip = destinoEstadoChip(meta.destino_estado);
            const tiempo = getDestinoTiempoResumen(d);
            const isFocus = focusStopRow?.id === d.id;
            return (
              <div
                key={d.id}
                style={{
                  border: `1px solid ${isFocus ? UI.blue : UI.line}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 800, color: UI.tx }}>{d.nombre}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: chip.bg, color: chip.color }}>
                    {chip.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
                  {d.direccion || "—"}
                  {tiempo.label ? ` · ${tiempo.label}` : ""}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  <button type="button" disabled={busy} onClick={() => handleDestinoLlegada(d)} style={miniBtn()}>
                    Registrar llegada
                  </button>
                  <button type="button" disabled={busy} onClick={() => handleDestinoSalida(d)} style={miniBtn()}>
                    Terminar descarga
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setFocusStop(d);
                      setEvidenciaTipos(["foto", "incidencia"]);
                    }}
                    style={miniBtn()}
                  >
                    POD / incidencia
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      ) : null}

      {servicio && getExpedienteDecaLinks(servicio).length ? (
        <Card title="DeCA GENERADOS">
          <AutonomoExpedienteDecaBlock servicio={servicio} showToast={showToast} />
        </Card>
      ) : null}

      {focusStopRow && servicio ? (
        <Card title={`DOCUMENTOS · ${focusStopRow.nombre}`}>
          <OperationalEvidenciasStop
            stopId={focusStopRow.id}
            servicioId={servicio.id}
            servicio={servicio}
            stop={focusStopRow}
            conductorName={conductorNombre}
            conductorId={uid}
            showToast={showToast}
            tiposPermitidos={evidenciaTipos || ["cmr", "foto", "incidencia"]}
            acquireActionLocation={(type, label) => acquireLocation(type, label)}
            onEvidenciaSaved={() => void reloadWorkspace(activeId)}
          />
        </Card>
      ) : null}

      {servicio ? (
        <Card title="DOCUMENTACIÓN LIBRE">
          <ServiceExtraDocumentsBlock
            servicio={servicio}
            showToast={showToast}
            uploaderName={conductorNombre}
            tone="light"
            compact
          />
        </Card>
      ) : null}

      {timeline?.length ? (
        <Card title="TIMELINE">
          {timeline.map((evt, i) => (
            <div key={`${evt.at}-${evt.type}-${i}`} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: UI.blue, minWidth: 44 }}>{evt.timeLabel}</div>
              <div style={{ fontSize: 13, color: UI.tx, lineHeight: 1.4 }}>{evt.label}</div>
            </div>
          ))}
        </Card>
      ) : null}

      {Object.keys(evidenciasByStop || {}).length ? (
        <Card title="INCLUIR EN PDF">
          {Object.entries(evidenciasByStop).flatMap(([stopId, evs]) =>
            (evs || []).map((ev) => {
              const included = isIncludedInExpedientePdf(servicio, "evidence", ev.id);
              return (
                <label
                  key={ev.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: `1px solid ${UI.line}`,
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => void togglePdfInclude("evidence", ev.id, included)}
                  />
                  <span>
                    {ev.tipo} · parada {stopId.slice(0, 6)}…
                  </span>
                </label>
              );
            }),
          )}
        </Card>
      ) : null}

      <AutonomoGenerarExpedienteModal
        open={generarModal}
        onClose={() => !busy && setGenerarModal(false)}
        workspace={workspace}
        profile={profile}
        busy={busy}
        onConfirm={handleGenerarExpediente}
      />

      <AutonomoRegistrarCargaModal
        open={cargaModal}
        onClose={() => {
          setCargaModal(false);
          setRetornoDesdeStopId(null);
        }}
        uid={uid}
        busy={busy}
        showToast={showToast}
        retornoMode={!!retornoDesdeStopId}
        retornoDesdeStopId={retornoDesdeStopId}
        onConfirm={handleRegistrarCarga}
      />
      <AutonomoDestinoModal open={destinoModal} onClose={() => setDestinoModal(false)} busy={busy} onConfirm={handleAddDestino} />
      <AutonomoDocAccionesModal
        open={docModal}
        onClose={() => setDocModal(false)}
        onSelect={(action) => {
          handleDocAction(action);
          if (!focusStopRow && cargas?.[0]) setFocusStop(cargas[cargas.length - 1]);
        }}
      />

      <AutonomoCargaEnMuelleModal
        open={!!cargaEnMuelleRow}
        cargaStop={cargaEnMuelleRow}
        servicio={servicio}
        destinos={destinos}
        busy={busy}
        onClose={() => setCargaEnMuelleModal(null)}
        onUpdateMercancia={async ({ mercancia, observaciones }) => {
          if (!cargaEnMuelleRow?.id) return;
          await updateCargaMercancia({
            stopId: cargaEnMuelleRow.id,
            servicioId: activeId,
            mercancia,
            observaciones,
          });
        }}
        onTerminarCarga={async () => {
          if (!cargaEnMuelleRow) return;
          await handleTerminarCargaMuelle(cargaEnMuelleRow);
          await reloadWorkspace(activeId);
        }}
        onGenerarDeca={() => {
          setCargaEnMuelleModal(null);
          setDecaModalCarga(cargaEnMuelleRow);
        }}
        onAddDestino={() => {
          setCargaEnMuelleModal(null);
          setDestinoModal(true);
        }}
        onScanCmr={() => {
          setCargaEnMuelleModal(null);
          setFocusStop(cargaEnMuelleRow);
          setEvidenciaTipos(["cmr"]);
        }}
        onSeguir={() => setCargaEnMuelleModal(null)}
      />

      <AutonomoGenerarDecaModal
        open={!!decaModalCargaRow}
        cargaStop={decaModalCargaRow}
        workspace={workspace}
        profile={profile}
        busy={busy}
        onClose={() => setDecaModalCarga(null)}
        onConfirm={handleGenerarDeca}
      />

      <AutonomoPostEntregaModal
        open={!!postEntregaDestino}
        destinoNombre={postEntregaDestino?.nombre}
        busy={busy}
        onClose={() => setPostEntregaDestino(null)}
        onRetorno={() => {
          setRetornoDesdeStopId(postEntregaDestino?.id || null);
          setPostEntregaDestino(null);
          setCargaModal(true);
        }}
        onFinalizar={() => {
          setPostEntregaDestino(null);
          setGenerarModal(true);
        }}
        onSeguir={() => setPostEntregaDestino(null)}
      />
    </div>
  );
}
