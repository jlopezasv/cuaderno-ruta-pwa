import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAllDcdtByServicio, filterDcdtRowsForUiSelector } from "../../domain/dcdt/dcdtModel.js";
import { resolveConductorDecaAccess } from "../../domain/dcdt/conductorDecaAccess.js";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { decaSelectorLabel, resolveScopeStopsForDcdt } from "../../domain/dcdt/dcdtMultiDeCaUi.js";
import { fetchDcdtResolveContext, validateDcdtReadiness } from "../../domain/dcdt/dcdtReadiness.js";
import { downloadDcdtStoredPdf } from "../../domain/dcdt/dcdtPdfDocument.js";
import { getServiceNumberForDisplay } from "../../domain/service/serviceIdentity.js";
import { getUserId } from "../../data/supabaseClient.js";
import {
  buildRutaModFormFromDoc,
  canModificarDecaEnRuta,
  confirmDecaRouteModification,
} from "../../domain/dcdt/decaRouteModification.js";
import { generateDecaQrDataUrl } from "../../domain/dcdt/decaQrImage.js";
import { DcdtQrModal } from "./DcdtQrModal.jsx";
import { DcdtReadonlyViewModal } from "./DcdtReadonlyViewModal.jsx";
import { AutonomoDecaFormModal } from "./AutonomoDecaFormModal.jsx";
import { emitConductorServicioDeca } from "../../domain/dcdt/emitConductorServicioDeca.js";
import { buildConductorDecaFormSeed, dcdtDatosToAutonomoSeed } from "../../domain/dcdt/autonomoDatosToDcdtDatos.js";
import { isDecaAplicable } from "../../domain/service/servicioAlcance.js";

const UI = {
  surface: "#ffffff",
  soft: "#f8fafc",
  border: "#dbe4ee",
  tx: "#0f172a",
  su: "#64748b",
  doc: "#334155",
  greenSoft: "#dcfce7",
  amberSoft: "#fffbeb",
  amberBorder: "#fde68a",
  amberTx: "#92400e",
};

function docBtnStyle(variant = "default") {
  if (variant === "primary") {
    return {
      width: "100%",
      background: UI.greenSoft,
      color: "#166534",
      border: "1px solid #bbf7d0",
      borderRadius: 10,
      padding: "10px 12px",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "left",
    };
  }
  return {
    width: "100%",
    background: UI.surface,
    color: UI.doc,
    border: `1px solid ${UI.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  };
}

function ConductorDecaQrPreview({ downloadUrl }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!downloadUrl) {
      setDataUrl("");
      return;
    }
    let cancelled = false;
    generateDecaQrDataUrl(downloadUrl)
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [downloadUrl]);

  if (!downloadUrl) return null;

  return (
    <div
      style={{
        background: UI.surface,
        border: `1px solid ${UI.border}`,
        borderRadius: 12,
        padding: "12px 12px 10px",
        marginBottom: 10,
        textAlign: "center",
      }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="Código QR DeCA"
          style={{ width: 180, height: 180, margin: "0 auto 8px", display: "block", borderRadius: 8 }}
        />
      ) : (
        <div style={{ padding: "28px 0", fontSize: 12, color: UI.su }}>Generando QR…</div>
      )}
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", wordBreak: "break-all", lineHeight: 1.4 }}
      >
        {downloadUrl}
      </a>
    </div>
  );
}

function phaseHint(phase) {
  if (phase === "validated" || phase === "pdf_ready") {
    return "Documento vigente. Puedes mostrarlo en un control o corregir matrícula y mercancía.";
  }
  if (phase === "pending_validation") {
    return "Datos listos. Tráfico puede validar después; el PDF ya se puede mostrar.";
  }
  return "Tráfico está completando el DeCA de este viaje.";
}

export function ConductorDcdtPanel({
  servicio,
  empresa = null,
  conductorUid = null,
  stops: stopsProp = [],
  showToast,
  compact = false,
}) {
  const [allDcdts, setAllDcdts] = useState([]);
  const [selectedDcdtId, setSelectedDcdtId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [rutaModForm, setRutaModForm] = useState(null);
  const [rutaModMotivo, setRutaModMotivo] = useState("");
  const [resolveCtx, setResolveCtx] = useState({
    stops: stopsProp,
    empresa,
    empresaOwnerProfile: null,
    conductor: null,
    masterById: {},
  });

  const empresaId = servicio?.empresa_id || empresa?.id;

  const visibleDcdts = useMemo(() => filterDcdtRowsForUiSelector(allDcdts), [allDcdts]);

  const dcdt = useMemo(() => {
    if (!visibleDcdts.length) return null;
    return visibleDcdts.find((r) => r.id === selectedDcdtId) || visibleDcdts[0];
  }, [visibleDcdts, selectedDcdtId]);

  const load = useCallback(async () => {
    if (!servicio?.id || !empresaId) {
      setAllDcdts([]);
      setSelectedDcdtId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rows, ctx] = await Promise.all([
        fetchAllDcdtByServicio(servicio.id).then((all) => filterDcdtRowsForUiSelector(all)),
        fetchDcdtResolveContext({
          servicio,
          stops: stopsProp,
          empresa,
          conductorUid: conductorUid || servicio?.conductor_id,
        }),
      ]);
      setResolveCtx(ctx);
      setAllDcdts(rows);
      setSelectedDcdtId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id || null));
    } catch {
      setAllDcdts([]);
      setSelectedDcdtId(null);
    } finally {
      setLoading(false);
    }
  }, [servicio, empresaId, stopsProp, empresa, conductorUid]);

  useEffect(() => {
    if (!visibleDcdts.length) return;
    if (!visibleDcdts.some((r) => r.id === selectedDcdtId)) {
      setSelectedDcdtId(visibleDcdts[0].id);
    }
  }, [visibleDcdts, selectedDcdtId]);

  const scopeStops = useMemo(() => {
    if (!dcdt) return resolveCtx.stops;
    return resolveScopeStopsForDcdt(resolveCtx.stops, dcdt);
  }, [dcdt, resolveCtx.stops]);

  useEffect(() => {
    load();
  }, [load]);

  const readiness = useMemo(() => {
    if (!dcdt) return validateDcdtReadiness({ servicio, dcdt: null });
    return validateDcdtReadiness({
      servicio,
      dcdt,
      stops: scopeStops,
      masterById: resolveCtx.masterById,
      empresa: resolveCtx.empresa,
      empresaOwnerProfile: resolveCtx.empresaOwnerProfile,
      conductor: resolveCtx.conductor,
    });
  }, [dcdt, servicio, resolveCtx, scopeStops]);

  const { doc, missing } = readiness;
  const validated = readiness.isValidated;
  const hasPdf = readiness.hasPdfStorage;
  const decaPublicId = dcdt?.decaPublicId || dcdt?.datos?.deca_public_id || null;
  const decaDownloadUrl = dcdt?.datos?.deca_download_url || null;
  const access = resolveConductorDecaAccess({
    hasDcdt: !!dcdt,
    isValidated: validated,
    hasPdfStorage: hasPdf,
    downloadUrl: decaDownloadUrl,
  });
  const phase = validated
    ? "validated"
    : access.hasPdf
      ? "pdf_ready"
      : missing.length === 0 && String(dcdt?.estado || "").toLowerCase() === "pendiente_validacion"
        ? "pending_validation"
        : "incomplete";
  const statusLabel = readiness.statusLabel;
  const serviceLabel = getServiceNumberForDisplay(servicio) || "—";
  const documentReady = access.hasPdf || validated;
  const canCreateTripDeca = !dcdt && isDecaAplicable(servicio) && !!empresaId;
  const canCompleteOwnDraft = !!dcdt && !!dcdt.datos?.emitido_por_conductor && !hasPdf;

  const formSeed = useMemo(() => {
    if (dcdt?.datos?.emitido_por_conductor) {
      return dcdtDatosToAutonomoSeed(dcdt.datos);
    }
    return buildConductorDecaFormSeed({
      servicio,
      stops: resolveCtx.stops,
      empresa: resolveCtx.empresa,
      conductor: resolveCtx.conductor,
    });
  }, [dcdt, servicio, resolveCtx.stops, resolveCtx.empresa, resolveCtx.conductor]);

  const formProfile = useMemo(
    () => ({
      nombre: resolveCtx.conductor?.nombre || "",
      matricula: resolveCtx.conductor?.matricula || "",
      remolque: resolveCtx.conductor?.remolque || "",
      empresa: resolveCtx.empresa?.nombre || "",
      cif: resolveCtx.empresa?.cif || "",
      direccion: resolveCtx.empresa?.direccion || resolveCtx.empresa?.domicilio_fiscal || "",
      cp: resolveCtx.empresa?.cp || "",
      ciudad: resolveCtx.empresa?.ciudad || "",
    }),
    [resolveCtx],
  );

  useEffect(() => {
    if (!servicio?.id || access.hasPdf || createOpen) return;
    const t = setInterval(() => {
      void load();
    }, 20000);
    return () => clearInterval(t);
  }, [servicio?.id, access.hasPdf, load, createOpen]);

  function selectDcdt(id) {
    setSelectedDcdtId(id);
    setViewOpen(false);
    setQrOpen(false);
    setModifyOpen(false);
  }

  function openQr() {
    if (!access.canShowQr) {
      showToast?.("URL DeCA no disponible. Tráfico debe generar el PDF.");
      return;
    }
    setQrOpen(true);
  }

  function openWebLink() {
    if (!decaDownloadUrl) {
      showToast?.("URL DeCA no disponible.");
      return;
    }
    window.open(decaDownloadUrl, "_blank", "noopener,noreferrer");
  }

  async function descargarPdf() {
    if (!hasPdf) {
      showToast?.("Tráfico aún no ha generado el PDF DeCA.");
      return;
    }
    setBusy("pdf");
    try {
      const name = dcdt.datos?.pdf_archivo_nombre || `dcdt-${serviceLabel}.pdf`;
      await downloadDcdtStoredPdf(dcdt, name);
      showToast?.(`PDF ${DECA_SHORT_LABEL} descargado`);
    } catch (e) {
      showToast?.(e?.message || "No se pudo obtener el PDF");
    } finally {
      setBusy(false);
    }
  }

  async function persistTripDeca(datos, { andPdf } = {}) {
    const result = await emitConductorServicioDeca({
      servicio,
      empresa: resolveCtx.empresa,
      stops: resolveCtx.stops,
      autonomoDatos: datos,
      conductorUid: conductorUid || getUserId(),
      andPdf: andPdf !== false,
      downloadAfter: !!andPdf,
    });
    await load();
    return result?.dcdt || result;
  }

  const canModify = canModificarDecaEnRuta({ servicio, dcdt });

  function openModify() {
    if (!doc) {
      showToast?.("No hay DeCA para modificar.");
      return;
    }
    if (!canModify) {
      showToast?.("El DeCA se puede modificar cuando hay PDF y el viaje está activo.");
      return;
    }
    setRutaModForm(buildRutaModFormFromDoc(doc));
    setRutaModMotivo("");
    setModifyOpen(true);
  }

  async function confirmModify() {
    if (!dcdt || !doc || !rutaModForm) return;
    setBusy("ruta-mod");
    try {
      await confirmDecaRouteModification({
        dcdt,
        servicio,
        docBefore: doc,
        form: rutaModForm,
        motivo: rutaModMotivo,
        userId: conductorUid || getUserId(),
        stops: scopeStops,
        masterById: resolveCtx.masterById,
        empresa: resolveCtx.empresa,
        empresaOwnerProfile: resolveCtx.empresaOwnerProfile,
        conductor: resolveCtx.conductor,
      });
      setModifyOpen(false);
      showToast?.("DeCA actualizado");
      await load();
    } catch (e) {
      showToast?.(e?.message || "No se pudo modificar el DeCA");
    } finally {
      setBusy(false);
    }
  }

  const createFormModal = (
    <AutonomoDecaFormModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      profile={formProfile}
      seedDatos={formSeed}
      onPersist={persistTripDeca}
      title={
        dcdt
          ? `Completar ${DECA_SHORT_LABEL} de este viaje`
          : `Crear ${DECA_SHORT_LABEL} de este viaje`
      }
      subtitle="Se guarda como documento de la empresa (PDF y QR del viaje)."
      showToast={showToast}
      onSaved={() => load()}
    />
  );

  if (!servicio?.id) return null;

  if (loading && !dcdt) {
    return (
      <div style={{ padding: compact ? "10px 0" : "12px 14px", fontSize: 12, color: UI.su }}>
        Cargando {DECA_SHORT_LABEL}…
      </div>
    );
  }

  if (!dcdt) {
    if (!isDecaAplicable(servicio)) {
      return (
        <div style={{ padding: compact ? "10px 0" : "12px 14px", fontSize: 13, color: UI.su, lineHeight: 1.45 }}>
          Este viaje es internacional: no lleva DeCA de control nacional.
        </div>
      );
    }
    return (
      <>
        <div style={{ padding: compact ? "10px 0" : "12px 14px" }}>
          <div style={{ fontSize: 13, color: UI.su, lineHeight: 1.45, marginBottom: 12 }}>
            Este viaje aún no tiene {DECA_SHORT_LABEL}. Puedes crearlo ahora; si Tráfico ya lo emite, no se duplicará.
          </div>
          {canCreateTripDeca ? (
            <button type="button" onClick={() => setCreateOpen(true)} style={docBtnStyle("primary")}>
              Crear {DECA_SHORT_LABEL} de este viaje
            </button>
          ) : null}
        </div>
        {createFormModal}
      </>
    );
  }

  const boxStyle = documentReady
    ? { border: "1px solid #bbf7d0", background: UI.greenSoft }
    : { border: `1px solid ${UI.amberBorder}`, background: UI.amberSoft };

  return (
    <>
      <div
        style={{
          marginTop: compact ? 0 : 14,
          padding: compact ? "10px 0 4px" : "12px 14px",
          borderRadius: compact ? 0 : 12,
          ...boxStyle,
          ...(compact ? { border: "none", background: "transparent", padding: "10px 0 4px" } : {}),
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: documentReady ? "#166534" : UI.amberTx, marginBottom: 6 }}>
          {statusLabel}
        </div>
        {visibleDcdts.length > 1 ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 6, letterSpacing: 0.4 }}>
              ELIGE DOCUMENTO DeCA
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {visibleDcdts.map((row, idx) => {
                const active = row.id === dcdt?.id;
                const label = decaSelectorLabel(row, idx, resolveCtx.masterById);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectDcdt(row.id)}
                    style={{
                      width: "100%",
                      background: active ? (documentReady ? "#bbf7d0" : "#fde68a") : UI.surface,
                      color: active ? UI.tx : UI.doc,
                      border: `1px solid ${active ? (documentReady ? "#86efac" : UI.amberBorder) : UI.border}`,
                      borderRadius: 10,
                      padding: "9px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div style={{ fontSize: 11, color: UI.su, marginBottom: 10, lineHeight: 1.4 }}>{phaseHint(phase)}</div>
        {!documentReady && missing.length ? (
          <div style={{ fontSize: 10, color: UI.amberTx, marginBottom: 10, lineHeight: 1.35 }}>
            Pendientes: {missing.map((m) => m.label).join(" · ")}
          </div>
        ) : null}
        {access.canShowQr ? <ConductorDecaQrPreview downloadUrl={decaDownloadUrl} /> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" style={docBtnStyle(access.canShowQr ? "primary" : "default")} disabled={!access.canShowQr} onClick={openQr}>
            Ampliar QR
          </button>
          <button type="button" style={docBtnStyle("default")} disabled={!decaDownloadUrl} onClick={openWebLink}>
            Abrir enlace web
          </button>
          <button
            type="button"
            style={docBtnStyle("default")}
            onClick={() => setViewOpen(true)}
            disabled={!access.canViewDocument || !doc}
          >
            Ver {DECA_SHORT_LABEL}
          </button>
          <button
            type="button"
            style={docBtnStyle("default")}
            onClick={descargarPdf}
            disabled={!access.canDownloadPdf || busy === "pdf"}
          >
            {busy === "pdf" ? "Obteniendo PDF…" : "Descargar PDF"}
          </button>
          {canCompleteOwnDraft ? (
            <button type="button" style={docBtnStyle("primary")} onClick={() => setCreateOpen(true)}>
              Completar y generar PDF
            </button>
          ) : null}
          <button
            type="button"
            style={docBtnStyle("default")}
            onClick={openModify}
            disabled={!canModify || !!busy}
          >
            Modificar DeCA actual
          </button>
        </div>
        {modifyOpen && rutaModForm ? (
          <div
            style={{
              marginTop: 12,
              background: UI.amberSoft,
              border: `1px solid ${UI.amberBorder}`,
              borderRadius: 12,
              padding: "12px 12px 10px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: UI.amberTx, marginBottom: 8 }}>Modificar DeCA actual</div>
            <div style={{ fontSize: 11, color: UI.amberTx, marginBottom: 10, lineHeight: 1.4 }}>
              Matrícula y mercancía. El motivo es obligatorio; el PDF se regenera con el mismo QR.
            </div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 4 }}>Matrícula tractora</label>
            <input
              value={rutaModForm.matricula}
              onChange={(e) => setRutaModForm((p) => ({ ...p, matricula: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI.border}`, marginBottom: 8, boxSizing: "border-box" }}
            />
            <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 4 }}>Matrícula remolque</label>
            <input
              value={rutaModForm.remolque}
              onChange={(e) => setRutaModForm((p) => ({ ...p, remolque: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI.border}`, marginBottom: 8, boxSizing: "border-box" }}
            />
            <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 4 }}>Mercancía</label>
            <input
              value={rutaModForm.descripcion}
              onChange={(e) => setRutaModForm((p) => ({ ...p, descripcion: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI.border}`, marginBottom: 8, boxSizing: "border-box" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 4 }}>Peso kg</label>
                <input
                  value={rutaModForm.peso_kg}
                  onChange={(e) => setRutaModForm((p) => ({ ...p, peso_kg: e.target.value }))}
                  style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 4 }}>Bultos</label>
                <input
                  value={rutaModForm.bultos}
                  onChange={(e) => setRutaModForm((p) => ({ ...p, bultos: e.target.value }))}
                  style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 4 }}>Palets</label>
                <input
                  value={rutaModForm.palets}
                  onChange={(e) => setRutaModForm((p) => ({ ...p, palets: e.target.value }))}
                  style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${UI.border}`, boxSizing: "border-box" }}
                />
              </div>
            </div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 4 }}>Motivo *</label>
            <textarea
              value={rutaModMotivo}
              onChange={(e) => setRutaModMotivo(e.target.value)}
              rows={2}
              placeholder="Ej. cambio de vehículo"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${UI.border}`, marginBottom: 10, boxSizing: "border-box", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                disabled={!!busy}
                onClick={confirmModify}
                style={{ ...docBtnStyle("primary"), flex: 1, textAlign: "center" }}
              >
                {busy === "ruta-mod" ? "Guardando…" : "Guardar y regenerar PDF"}
              </button>
              <button type="button" disabled={!!busy} onClick={() => setModifyOpen(false)} style={{ ...docBtnStyle("default"), flex: 1, textAlign: "center" }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {viewOpen ? (
        <DcdtReadonlyViewModal
          servicio={servicio}
          doc={doc}
          dcdt={dcdt}
          missing={missing}
          onClose={() => setViewOpen(false)}
        />
      ) : null}

      {qrOpen ? (
        <DcdtQrModal
          decaPublicId={decaPublicId}
          downloadUrl={decaDownloadUrl}
          dcdt={dcdt}
          numeroDcdt={serviceLabel}
          showToast={showToast}
          onClose={() => setQrOpen(false)}
        />
      ) : null}
      {createFormModal}
    </>
  );
}
