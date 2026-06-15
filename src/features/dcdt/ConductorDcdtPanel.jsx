import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureDcdtForServicio, fetchDcdtByServicio } from "../../domain/dcdt/dcdtModel.js";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { fetchDcdtResolveContext, validateDcdtReadiness } from "../../domain/dcdt/dcdtReadiness.js";
import { downloadDcdtStoredPdf } from "../../domain/dcdt/dcdtPdfDocument.js";
import { getServiceNumberForDisplay } from "../../domain/service/serviceIdentity.js";
import { DcdtQrModal } from "./DcdtQrModal.jsx";
import { DcdtReadonlyViewModal } from "./DcdtReadonlyViewModal.jsx";

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

function phaseHint(phase) {
  if (phase === "validated") {
    return "Documento listo para inspección. Puedes mostrarlo sin depender de tráfico.";
  }
  if (phase === "pdf_ready") {
    return "PDF DeCA generado. Puedes descargarlo o mostrar el QR; tráfico puede validar después.";
  }
  if (phase === "pending_validation") {
    return "Datos completos. Tráfico debe generar el PDF DeCA antes o durante el viaje.";
  }
  return "Tráfico está completando los datos del DeCA.";
}

export function ConductorDcdtPanel({
  servicio,
  empresa = null,
  conductorUid = null,
  stops: stopsProp = [],
  showToast,
  compact = false,
}) {
  const [dcdt, setDcdt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [resolveCtx, setResolveCtx] = useState({
    stops: stopsProp,
    empresa,
    empresaOwnerProfile: null,
    conductor: null,
    masterById: {},
  });

  const empresaId = servicio?.empresa_id || empresa?.id;

  const load = useCallback(async () => {
    if (!servicio?.id || !empresaId) {
      setDcdt(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [row, ctx] = await Promise.all([
        fetchDcdtByServicio(servicio.id).then(
          (r) => r || ensureDcdtForServicio({ servicioId: servicio.id, empresaId, stops: stopsProp }),
        ),
        fetchDcdtResolveContext({
          servicio,
          stops: stopsProp,
          empresa,
          conductorUid: conductorUid || servicio?.conductor_id,
        }),
      ]);
      setResolveCtx(ctx);
      setDcdt(row);
    } catch {
      setDcdt(null);
    } finally {
      setLoading(false);
    }
  }, [servicio, empresaId, stopsProp, empresa, conductorUid]);

  useEffect(() => {
    load();
  }, [load]);

  const readiness = useMemo(() => {
    if (!dcdt) return validateDcdtReadiness({ servicio, dcdt: null });
    return validateDcdtReadiness({
      servicio,
      dcdt,
      stops: resolveCtx.stops,
      masterById: resolveCtx.masterById,
      empresa: resolveCtx.empresa,
      empresaOwnerProfile: resolveCtx.empresaOwnerProfile,
      conductor: resolveCtx.conductor,
    });
  }, [dcdt, servicio, resolveCtx]);

  const { doc, missing } = readiness;
  const validated = readiness.isValidated;
  const hasPdf = readiness.hasPdfStorage;
  const phase = validated
    ? "validated"
    : hasPdf
      ? "pdf_ready"
      : missing.length === 0 && String(dcdt?.estado || "").toLowerCase() === "pendiente_validacion"
        ? "pending_validation"
        : "incomplete";
  const statusLabel = readiness.statusLabel;
  const decaPublicId = dcdt?.decaPublicId || dcdt?.datos?.deca_public_id || null;
  const decaDownloadUrl = dcdt?.datos?.deca_download_url || null;
  const serviceLabel = getServiceNumberForDisplay(servicio) || "—";

  useEffect(() => {
    if (!servicio?.id || validated) return;
    const t = setInterval(() => {
      void load();
    }, 20000);
    return () => clearInterval(t);
  }, [servicio?.id, validated, load]);

  function openQr() {
    if (!dcdt || !doc) {
      showToast?.(`${DECA_SHORT_LABEL} no disponible.`);
      return;
    }
    if (!hasPdf) {
      showToast?.("Genera el PDF DeCA antes de mostrar el QR.");
      return;
    }
    if (!decaDownloadUrl) {
      showToast?.("URL DeCA no disponible — regenera el PDF.");
      return;
    }
    setQrOpen(true);
  }

  async function descargarPdf() {
    if (!hasPdf) {
      showToast?.("Genera el PDF DeCA antes de descargarlo.");
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

  if (!servicio?.id) return null;

  if (loading && !dcdt) {
    return (
      <div style={{ padding: compact ? "10px 0" : "12px 14px", fontSize: 12, color: UI.su }}>
        Cargando {DECA_SHORT_LABEL}…
      </div>
    );
  }

  if (!dcdt) return null;

  const boxStyle = validated
    ? { border: "1px solid #bbf7d0", background: UI.greenSoft }
    : { border: `1px solid ${UI.amberBorder}`, background: UI.amberSoft };

  const pdfBtnLabel = readiness.canDownloadPdf || decaDownloadUrl
    ? "Descargar PDF"
    : validated
      ? "Descargar PDF (pendiente de generar)"
      : "Descargar PDF";

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
        <div style={{ fontSize: 12, fontWeight: 800, color: validated ? "#166534" : UI.amberTx, marginBottom: 6 }}>
          {statusLabel}
        </div>
        <div style={{ fontSize: 11, color: UI.su, marginBottom: 10, lineHeight: 1.4 }}>{phaseHint(phase)}</div>
        {!validated && missing.length ? (
          <div style={{ fontSize: 10, color: UI.amberTx, marginBottom: 10, lineHeight: 1.35 }}>
            Pendientes: {missing.map((m) => m.label).join(" · ")}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {validated ? (
            <>
              <button type="button" style={docBtnStyle("primary")} onClick={() => setViewOpen(true)} disabled={!doc}>
                Ver {DECA_SHORT_LABEL}
              </button>
              <button
                type="button"
                style={docBtnStyle("default")}
                onClick={descargarPdf}
                disabled={!doc || busy === "pdf" || (!readiness.canDownloadPdf && !decaDownloadUrl)}
              >
                {busy === "pdf" ? "Obteniendo PDF…" : pdfBtnLabel}
              </button>
              <button type="button" disabled={!decaDownloadUrl} style={docBtnStyle("default")} onClick={openQr}>
                Mostrar QR {DECA_SHORT_LABEL}
              </button>
            </>
          ) : (
            <button type="button" style={docBtnStyle("default")} onClick={() => setViewOpen(true)}>
              Ver estado
            </button>
          )}
        </div>
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
    </>
  );
}
