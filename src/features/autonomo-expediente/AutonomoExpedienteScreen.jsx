import { useCallback, useEffect, useState } from "react";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";
import { geoPayloadFromLocationResult } from "../../data/driverActionGps.js";
import { OperationalEvidenciasStop } from "../documents/OperationalEvidenciasStop.jsx";
import { DriverLocationGateModal } from "../services/components/DriverLocationGateModal.jsx";
import { useDriverActionLocation } from "../services/hooks/useDriverActionLocation.js";
import { OperationalSummaryLite } from "../../modules/operational-lite/OperationalSummaryLite.jsx";
import {
  createAutonomoExpediente,
  fetchAutonomoExpedientes,
  loadAutonomoExpedienteWorkspace,
  registerCargaOnExpediente,
  registrarEntradaMuelleCarga,
  addDestinoOnExpediente,
  updateDestinoEstado,
  generarExpedienteAutonomo,
  generarDecaCargaExpediente,
  terminarCargaMuelle,
  updateCargaMercancia,
  archiveAutonomoExpediente,
  abrirOperacionMuelle,
  registrarMovimientoEnMuelle,
  cerrarOperacionMuelle,
  anularOperacionMuelle,
  anularExpedienteAutonomo,
  cancelAutonomoStopOperacion,
  registrarIncidenciaExpediente,
} from "../../modules/autonomo-expediente/autonomoExpedienteApi.js";
import { getOperacionMuelleActiva } from "../../modules/autonomo-expediente/operacionMuelleModel.js";
import { loadArchivedAutonomoExpedienteIds } from "../../modules/autonomo-expediente/autonomoExpedienteArchive.js";
import { getCargaAlcance, isCargaNacional } from "../../modules/autonomo-expediente/autonomoExpedienteDeca.js";
import {
  buildExpedienteOperativoState,
  cargaNeedsDeca,
  decaLinkForCarga,
  filterDestinosActivos,
} from "../../modules/autonomo-expediente/autonomoExpedienteUiModel.js";
import { saveAutonomoProProfileFromDeca } from "../../modules/autonomo-expediente/autonomoProProfileApi.js";
import {
  getCargaMuelleResumen,
  getDestinoTiempoResumen,
  isCargaEnMuelle,
  isCargaPendienteEntrada,
  isCargaTerminada,
  isDestinoEntregado,
  isRetornoCarga,
} from "../../modules/autonomo-expediente/autonomoExpedienteStopModel.js";
import { SERVICIO_ALCANCE_LABELS } from "../../domain/service/servicioAlcance.js";
import { muelleCargaRapidaLabel, muelleEntradaLabel, muelleSalidaLabel } from "../../domain/service/muelleLabels.js";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { AutonomoRegistrarCargaModal } from "./AutonomoRegistrarCargaModal.jsx";
import { AutonomoDestinoModal } from "./AutonomoDestinoModal.jsx";
import { AutonomoGenerarExpedienteModal } from "./AutonomoGenerarExpedienteModal.jsx";
import { AutonomoExpedienteDecaBlock } from "./AutonomoExpedienteDecaBlock.jsx";
import { ExpedienteOperacionalConductor } from "../operational/ExpedienteOperacionalConductor.jsx";
import { OPERATION_KIND, visualForStop } from "../../domain/service/operationalVisualModel.js";
import { AutonomoCargaEnMuelleModal } from "./AutonomoCargaEnMuelleModal.jsx";
import { AutonomoPostCargaModal } from "./AutonomoPostCargaModal.jsx";
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

function stopAllowsDocumentacion(stop) {
  if (!stop) return false;
  const tipo = String(stop.tipo || "").toLowerCase();
  if (tipo === "carga") {
    if (isCargaEnMuelle(stop)) return true;
    if (!isCargaNacional(stop) && isCargaTerminada(stop)) return true;
    return false;
  }
  if (tipo === "descarga") return !isDestinoEntregado(stop);
  return false;
}

function StopDocumentacionInline({
  stop,
  servicio,
  uid,
  conductorNombre,
  showToast,
  acquireLocation,
  onSaved,
}) {
  if (!stopAllowsDocumentacion(stop)) return null;
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${UI.line}` }}>
      <OperationalEvidenciasStop
        stopId={stop.id}
        servicioId={servicio?.id}
        servicio={servicio}
        stop={stop}
        conductorName={conductorNombre}
        conductorId={uid}
        showToast={showToast}
        variant="docsShell"
        hideIa
        tiposPermitidos={["cmr", "foto", "incidencia"]}
        acquireActionLocation={(type, label) => acquireLocation(type, label)}
        onEvidenciaSaved={onSaved}
      />
    </div>
  );
}

export function AutonomoExpedienteScreen({
  uid,
  profile = {},
  conductorNombre = "Conductor",
  showToast,
  onProfileUpdate,
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expedientes, setExpedientes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [view, setView] = useState("home");
  const [cargaModal, setCargaModal] = useState(false);
  const [destinoModal, setDestinoModal] = useState(false);
  const [generarModal, setGenerarModal] = useState(false);
  const [cargaEnMuelleModal, setCargaEnMuelleModal] = useState(null);
  const [postCargaStop, setPostCargaStop] = useState(null);
  const [decaModalCarga, setDecaModalCarga] = useState(null);
  const [postEntregaDestino, setPostEntregaDestino] = useState(null);
  const [stockActual, setStockActual] = useState([]);
  const [cargaModalRetorno, setCargaModalRetorno] = useState(false);
  const [retornoDesdeStopId, setRetornoDesdeStopId] = useState(null);
  const [workspaceDismissed, setWorkspaceDismissed] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => loadArchivedAutonomoExpedienteIds(uid));
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

  useEffect(() => {
    const onOpen = (ev) => {
      const id = ev?.detail?.id;
      const mode = ev?.detail?.view || "workspace";
      if (!id) return;
      setWorkspaceDismissed(false);
      setActiveId(id);
      setView(mode === "resumen" ? "resumen" : "workspace");
    };
    window.addEventListener("autonomo-expediente-open", onOpen);
    return () => window.removeEventListener("autonomo-expediente-open", onOpen);
  }, []);

  useEffect(() => {
    if (loading || activeId || workspaceDismissed) return;
    const active = expedientes.find((e) => {
      if (archivedIds.has(e.id)) return false;
      const st = String(e.estado || "").toLowerCase();
      return st === "en_curso" || st === "asignado";
    });
    if (active) {
      setActiveId(active.id);
      setView("workspace");
    }
  }, [loading, expedientes, activeId, archivedIds, workspaceDismissed]);

  async function handleNuevoExpediente() {
    setBusy(true);
    try {
      const row = await createAutonomoExpediente(uid, { profile });
      setWorkspaceDismissed(false);
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
      const { stop } = await registerCargaOnExpediente({
        servicioId: activeId,
        uid,
        almacen: payload.almacen,
        alcance: payload.alcance,
        mercancia: payload.mercancia,
        esRetorno: payload.esRetorno,
        retornoDesdeStopId: payload.retornoDesdeStopId,
        requiereDeca: payload.requiereDeca,
      });
      setCargaModal(false);
      setRetornoDesdeStopId(null);
      await reloadWorkspace(activeId);
      showToast?.("Carga prevista registrada");
    } catch (e) {
      showToast?.(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleEntradaMuellePendiente(cargaStop) {
    if (!activeId || !cargaStop?.id) return;
    setBusy(true);
    try {
      let geoEntrada = null;
      try {
        const loc = await acquireLocation("entrada_muelle", "Entrada en muelle");
        if (loc?.ok) geoEntrada = geoPayloadFromLocationResult(loc);
        else if (loc === null) return;
      } catch {
        /* GPS opcional */
      }
      const stop = await registrarEntradaMuelleCarga({
        stopId: cargaStop.id,
        servicioId: activeId,
        geo: geoEntrada,
      });
      await reloadWorkspace(activeId);
      setCargaEnMuelleModal(stop);
      showToast?.("Entrada en muelle registrada");
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

  function handlePrimaryAction(proxima) {
    if (!proxima) return;
    if (proxima.kind === OPERATION_KIND.DESCARGA && proxima.stop) {
      if (proxima.phase === "en_muelle") void handleDestinoSalida(proxima.stop);
      else void handleDestinoLlegada(proxima.stop);
      return;
    }
    if ((proxima.kind === OPERATION_KIND.CARGA || proxima.kind === OPERATION_KIND.RETORNO) && proxima.stop) {
      if (proxima.phase === "en_muelle") setCargaEnMuelleModal(proxima.stop);
      else void handleEntradaMuellePendiente(proxima.stop);
      return;
    }
    if (proxima.kind === "cerrar") {
      setGenerarModal(true);
      return;
    }
    if (proxima.kind === "idle") {
      if (proxima.secondaryLabel?.includes("destino")) setDestinoModal(true);
      else setCargaModal(true);
    }
  }

  async function handleAbrirEntradaMuelle({ lugar, tipo_previsto, observacion, geo }) {
    if (!activeId) return;
    setBusy(true);
    try {
      await abrirOperacionMuelle({
        servicioId: activeId,
        uid,
        lugar,
        tipo_previsto,
        observacion,
        geo,
      });
      await reloadWorkspace(activeId);
      showToast?.("Entrada en muelle registrada");
    } catch (e) {
      showToast?.(e?.message || "Error al abrir muelle");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleRegistrarMovimientoMuelle(movimiento) {
    if (!activeId) return;
    setBusy(true);
    try {
      if (movimiento.tipo === "incidencia" && !getOperacionMuelleActiva(workspace?.servicio)) {
        await registrarIncidenciaExpediente({
          servicioId: activeId,
          descripcion: movimiento.descripcion_mercancia || movimiento.observaciones || "Incidencia",
          observaciones: movimiento.observaciones,
        });
        await reloadWorkspace(activeId);
        showToast?.("Incidencia registrada");
        return;
      }

      const result = await registrarMovimientoEnMuelle({
        servicioId: activeId,
        movimiento,
        stockActual,
      });

      if (result.stockActual) {
        setStockActual(result.stockActual);
      } else {
        try {
          const { fetchDecaActualVisible } = await import("../../domain/dcdt/decaVivoModel.js");
          const deca = await fetchDecaActualVisible(activeId);
          setStockActual(deca?.stock_actual || []);
        } catch {
          /* stock se refrescará al recargar */
        }
      }

      await reloadWorkspace(activeId);

      if (movimiento.tipo === "carga") {
        showToast?.(
          result.decaPending
            ? "Carga guardada. DeCA pendiente de actualizar."
            : "Carga registrada correctamente",
        );
      } else {
        showToast?.(
          result.decaPending ? "Registrado. DeCA pendiente de actualizar." : "Registrado correctamente",
        );
      }
    } catch (e) {
      console.error("[carga] Error guardando", e);
      showToast?.(humanizeApiError(e, "No se pudo registrar la carga.").message);
      throw humanizeApiError(e, "No se pudo registrar la carga.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSalidaMuelle({ sin_cambios, geo, observacion = null }) {
    if (!activeId) return;
    setBusy(true);
    try {
      await cerrarOperacionMuelle({
        servicioId: activeId,
        sin_cambios,
        geo,
        observacion,
      });
      await reloadWorkspace(activeId);
      showToast?.("Salida de muelle registrada");
    } catch (e) {
      showToast?.(e?.message || "Error al cerrar muelle");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelarEntradaMuelle() {
    if (!activeId) return;
    if (!window.confirm("¿Cancelar la entrada en muelle?")) return;
    setBusy(true);
    try {
      await anularOperacionMuelle({ servicioId: activeId });
      await reloadWorkspace(activeId);
      showToast?.("Entrada cancelada");
    } catch (e) {
      showToast?.(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleAnularExpediente(motivo) {
    if (!activeId) return;
    setBusy(true);
    try {
      const result = await anularExpedienteAutonomo({ servicioId: activeId, uid, motivo });
      await reloadList();
      if (result.mode === "deleted") {
        setActiveId(null);
        setWorkspace(null);
        setView("home");
        setWorkspaceDismissed(true);
      } else {
        setActiveId(null);
        setWorkspace(null);
        setView("home");
        setWorkspaceDismissed(true);
      }
      showToast?.(result.mode === "deleted" ? "Expediente eliminado" : "Expediente anulado");
    } catch (e) {
      showToast?.(e?.message || "No se pudo anular");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelOperacion({ stop, mode }) {
    if (!activeId || !stop?.id) return;
    const motivo =
      mode === "anular"
        ? window.prompt("Motivo de anulación (obligatorio):", "")?.trim()
        : "";
    if (mode === "anular" && !motivo) {
      showToast?.("Indique el motivo de anulación");
      return;
    }
    if (mode === "delete" && !window.confirm("¿Cancelar esta operación? No se ha confirmado aún.")) return;
    setBusy(true);
    try {
      await cancelAutonomoStopOperacion({
        stopId: stop.id,
        servicioId: activeId,
        mode,
        motivo,
      });
      await reloadWorkspace(activeId);
      showToast?.(mode === "delete" ? "Operación cancelada" : "Operación anulada");
    } catch (e) {
      showToast?.(e?.message || "No se pudo cancelar");
    } finally {
      setBusy(false);
    }
  }

  function openRegistrarRetorno() {
    setRetornoDesdeStopId(null);
    setCargaModalRetorno(true);
    setCargaModal(true);
  }

  function openRegistrarDevolucion() {
    setRetornoDesdeStopId(null);
    setCargaModalRetorno(true);
    setCargaModal(true);
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

  async function handleGenerarDeca({ transportista, conductor, vehiculo, cargaStopId, saveProfile }) {
    if (!activeId) return;
    setBusy(true);
    try {
      if (saveProfile && uid) {
        const next = await saveAutonomoProProfileFromDeca(uid, {
          transportista,
          conductor,
          vehiculo,
          profile,
        });
        onProfileUpdate?.(next);
      }
      await generarDecaCargaExpediente({
        servicioId: activeId,
        cargaStopId,
        workspace,
        profile,
        uid,
        transportista,
        conductor,
        vehiculo,
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
          DIARIO OPERATIVO
        </div>
        <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.5, marginBottom: 16 }}>
          {active
            ? "Tienes un expediente en curso."
            : "Inicia un expediente y trabaja sobre la marcha. Histórico en Más."}
        </div>

        {active ? (
          <button
            type="button"
            style={bigBtn(UI.blue, busy)}
            disabled={busy}
            onClick={() => {
              setWorkspaceDismissed(false);
              setActiveId(active.id);
              setView("workspace");
            }}
          >
            Continuar expediente
          </button>
        ) : (
          <button type="button" style={bigBtn(UI.green, busy)} disabled={busy} onClick={handleNuevoExpediente}>
            + Nuevo expediente
          </button>
        )}
      </div>
    );
  }

  const { servicio, cargas, destinos, stops, timeline } = workspace || {};
  const cargaEnMuelleRow = cargaEnMuelleModal?.id
    ? stops?.find((s) => s.id === cargaEnMuelleModal.id) || cargaEnMuelleModal
    : null;
  const postCargaRow = postCargaStop?.id
    ? stops?.find((s) => s.id === postCargaStop.id) || postCargaStop
    : null;
  const decaModalCargaRow = decaModalCarga?.id
    ? stops?.find((s) => s.id === decaModalCarga.id) || decaModalCarga
    : null;
  const operativo = buildExpedienteOperativoState({ servicio, cargas: cargas || [], destinos: destinos || [] });
  const destinosActivos = filterDestinosActivos(destinos || []);
  const reloadDocs = () => void reloadWorkspace(activeId);

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
        <button
          type="button"
          onClick={() => {
            setWorkspaceDismissed(true);
            setActiveId(null);
            setView("home");
          }}
          style={{ background: "transparent", border: "none", color: UI.su, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          Salir
        </button>
      </div>

      <Card title="ESTADO ACTUAL">
        <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx }}>{operativo.estadoLabel}</div>
        {operativo.sugerencias.slice(0, 1).map((s) => (
          <div key={s.id} style={{ fontSize: 13, color: UI.blue, marginTop: 8, fontWeight: 700 }}>
            → {s.label}
          </div>
        ))}
      </Card>

      <ExpedienteOperacionalConductor
        servicio={servicio}
        stockActual={stockActual}
        busy={busy}
        uid={uid}
        conductorNombre={conductorNombre}
        showToast={showToast}
        acquireLocation={acquireLocation}
        onReload={() => reloadWorkspace(activeId)}
        onEntradaMuelle={handleAbrirEntradaMuelle}
        onRegistrarMovimiento={handleRegistrarMovimientoMuelle}
        onSalidaMuelle={handleSalidaMuelle}
        onCancelarEntradaMuelle={handleCancelarEntradaMuelle}
        onAnularExpediente={handleAnularExpediente}
        onAñadirCargaPrevista={() => setCargaModal(true)}
        onAñadirDestinoPrevisto={() => setDestinoModal(true)}
        onFinalizar={() => setGenerarModal(true)}
        onStockChange={setStockActual}
        stops={[...(cargas || []), ...(destinos || [])]}
        canFinalizar={operativo.canSuggestFinalizar}
      />

      {(timeline?.length || stops?.filter((s) => !getStopOperacionMeta(s.notas)?.es_session_muelle)?.length) ? (
        <Card title="RECORRIDO">
          {timeline?.length
            ? timeline.slice(-15).map((evt, idx, arr) => (
                <div
                  key={`${evt.type}-${evt.at}-${evt.stopId || idx}`}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: idx < arr.length - 1 ? `1px solid ${UI.line}` : "none",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, color: UI.blue, minWidth: 44 }}>{evt.timeLabel}</div>
                  <div style={{ fontSize: 13, color: UI.tx, lineHeight: 1.4 }}>{evt.label}</div>
                </div>
              ))
            : stops
                .filter((s) => !getStopOperacionMeta(s.notas)?.es_session_muelle)
                .map((s) => {
                  const vis = visualForStop(s);
                  if (!vis) return null;
                  const isCarga = String(s.tipo || "").toLowerCase() === "carga";
                  const muelle = isCarga ? getCargaMuelleResumen(s) : getDestinoTiempoResumen(s);
                  return (
                    <div
                      key={s.id}
                      style={{
                        border: `2px solid ${vis.border}`,
                        borderRadius: 12,
                        padding: "10px 12px",
                        marginBottom: 8,
                        fontSize: 13,
                        background: vis.bg,
                      }}
                    >
                      <div style={{ fontWeight: 800, color: vis.color }}>
                        {vis.icon} {vis.label} · {s.nombre}
                      </div>
                      <div style={{ fontSize: 12, color: UI.su, marginTop: 2 }}>{muelle?.label || "—"}</div>
                    </div>
                  );
                })}
        </Card>
      ) : null}

      {operativo.nacionalSinDeca?.length ? (
        <Card title="DeCA PENDIENTE">
          {operativo.nacionalSinDeca.map((c) => (
            <div key={c.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{c.nombre}</span>
              <button type="button" disabled={busy} onClick={() => setDecaModalCarga(c)} style={miniBtn(UI.green)}>
                Generar DeCA
              </button>
            </div>
          ))}
        </Card>
      ) : null}

      {operativo.canSuggestFinalizar ? (
        <div style={{ marginTop: 8, marginBottom: 12 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => setGenerarModal(true)}
            style={{
              width: "100%",
              padding: "11px 12px",
              borderRadius: 10,
              border: `1px solid ${UI.line}`,
              background: "#fff",
              color: UI.su,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Finalizar expediente
          </button>
        </div>
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
          setCargaModalRetorno(false);
        }}
        uid={uid}
        busy={busy}
        showToast={showToast}
        retornoMode={cargaModalRetorno || !!retornoDesdeStopId}
        retornoDesdeStopId={retornoDesdeStopId}
        onConfirm={handleRegistrarCarga}
      />
      <AutonomoDestinoModal
        open={destinoModal}
        onClose={() => setDestinoModal(false)}
        uid={uid}
        busy={busy}
        showToast={showToast}
        onConfirm={handleAddDestino}
      />

      <AutonomoCargaEnMuelleModal
        open={!!cargaEnMuelleRow}
        cargaStop={cargaEnMuelleRow}
        busy={busy}
        showToast={showToast}
        onClose={() => setCargaEnMuelleModal(null)}
        onEntradaPendiente={(stop) => void handleEntradaMuellePendiente(stop)}
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
        onCargaTerminada={(stop) => {
          setCargaEnMuelleModal(null);
          setPostCargaStop(stop);
        }}
      />

      <AutonomoPostCargaModal
        open={!!postCargaRow}
        cargaStop={postCargaRow}
        busy={busy}
        sinDestino={!(destinos?.length)}
        showDeca={
          postCargaRow
            ? isCargaNacional(postCargaRow) && getStopOperacionMeta(postCargaRow.notas).no_requiere_deca !== true
            : false
        }
        hasDeca={postCargaRow ? !!decaLinkForCarga(servicio, postCargaRow.id) : false}
        esInternacional={postCargaRow ? !isCargaNacional(postCargaRow) : false}
        onClose={() => setPostCargaStop(null)}
        onAddDestino={() => {
          setPostCargaStop(null);
          setDestinoModal(true);
        }}
        onGenerarDeca={() => {
          setPostCargaStop(null);
          setDecaModalCarga(postCargaRow);
        }}
        onScanCmr={() => setPostCargaStop(null)}
        onSeguir={() => setPostCargaStop(null)}
      />

      <AutonomoGenerarDecaModal
        open={!!decaModalCargaRow}
        cargaStop={decaModalCargaRow}
        workspace={workspace}
        profile={profile}
        busy={busy}
        onClose={() => setDecaModalCarga(null)}
        onConfirm={handleGenerarDeca}
        onUpdateMercancia={async ({ mercancia }) => {
          if (!decaModalCargaRow?.id) return;
          await updateCargaMercancia({
            stopId: decaModalCargaRow.id,
            servicioId: activeId,
            mercancia,
          });
          await reloadWorkspace(activeId);
        }}
        onAddDestino={() => {
          setDecaModalCarga(null);
          setDestinoModal(true);
        }}
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
        onPod={() => {
          setPostEntregaDestino(null);
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
