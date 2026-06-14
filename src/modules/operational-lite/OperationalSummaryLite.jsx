import React, { useCallback, useEffect, useState } from "react";
import { loadOperationalLiteData } from "./loadOperationalLiteData.js";
import { downloadOperationalLitePdf } from "./generateOperationalLitePdf.js";
import { LITE_THEME } from "./operationalLiteTheme.js";
import {
  LiteCierrePremium,
  LiteEvidenciasGallery,
  LiteHeader,
  LiteMetaGrid,
  LitePreviewModal,
  LiteResumenEjecutivo,
  LiteTimeline,
} from "./operationalLiteUiParts.jsx";

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: LITE_THEME.su,
        letterSpacing: 0.7,
        marginBottom: 12,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Vista e impresión del Documento Operacional Lite (Autónomo PRO).
 */
export function OperationalSummaryLite({
  servicio,
  conductorNombre = "Conductor",
  showToast,
  compact = false,
  onOpenUrl,
}) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const nombreConductor = useCallback(
    () => conductorNombre,
    [conductorNombre],
  );

  useEffect(() => {
    if (!servicio?.id) {
      setDoc(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const model = await loadOperationalLiteData(servicio, { nombreConductor });
        if (!cancelled) setDoc(model);
      } catch {
        if (!cancelled) setDoc(null);
        showToast?.("No se pudo cargar el documento operacional");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [servicio?.id, servicio?.estado, servicio?.updated_at, nombreConductor, showToast]);

  const handlePdf = async () => {
    if (!doc || pdfBusy) return;
    setPdfBusy(true);
    try {
      showToast?.("Generando expediente PDF…");
      await downloadOperationalLitePdf(doc);
      showToast?.("PDF listo");
    } catch {
      showToast?.("No se pudo generar el PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  const handlePreview = (item) => {
    if (!item?.url) return;
    if (onOpenUrl) {
      onOpenUrl(item.url);
      return;
    }
    setPreview(item);
  };

  if (loading) {
    return (
      <div style={{ padding: compact ? 20 : 32, textAlign: "center" }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: `2px solid ${LITE_THEME.line}`,
            borderTopColor: LITE_THEME.blue,
            borderRadius: "50%",
            margin: "0 auto 12px",
            animation: "liteSpin .8s linear infinite",
          }}
        />
        <div style={{ fontSize: 13, color: LITE_THEME.su, fontWeight: 600 }}>Preparando expediente…</div>
        <style>{`@keyframes liteSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ padding: compact ? 16 : 24, textAlign: "center", color: LITE_THEME.su, fontSize: 13 }}>
        No hay datos para el expediente operacional.
      </div>
    );
  }

  return (
    <>
      <div
        className="operational-lite-doc"
        style={{
          background: compact ? "transparent" : LITE_THEME.page,
          minHeight: compact ? undefined : "50vh",
          padding: compact ? 0 : "12px 12px max(20px, env(safe-area-inset-bottom))",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <style>{`
          @media print {
            .operational-lite-doc .no-print { display: none !important; }
            .operational-lite-doc { background: white !important; padding: 0 !important; }
            .operational-lite-doc .lite-card { box-shadow: none !important; border: none !important; }
          }
          @media (min-width: 768px) {
            .operational-lite-doc .lite-actions { max-width: 480px; margin: 0 auto; }
          }
        `}</style>

        <div
          className="lite-card"
          style={{
            background: LITE_THEME.card,
            border: `1px solid ${LITE_THEME.line}`,
            borderRadius: compact ? 14 : 18,
            overflow: "hidden",
            boxShadow: compact ? "none" : "0 12px 40px rgba(15,23,42,.1)",
            maxWidth: 720,
            margin: "0 auto",
          }}
        >
          <LiteHeader doc={doc} compact={compact} />

          {doc.dcdt ? (
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${LITE_THEME.line}`, background: "#f0f9ff" }}>
              <SectionTitle>DCDT — Documento de Control del Transporte</SectionTitle>
              <div style={{ fontSize: 12, color: LITE_THEME.su, marginBottom: 10 }}>Orden FOM/2861/2012</div>
              {[
                ["Cargador", doc.dcdt.cargador?.nombre],
                ["Transportista", doc.dcdt.transportista?.nombre],
                ["Origen", doc.dcdt.origen],
                ["Destino", doc.dcdt.destino],
                ["Mercancía", doc.dcdt.mercancia?.descripcion],
                ["Peso (kg)", doc.dcdt.mercancia?.peso_kg],
                ["Matrícula", doc.dcdt.vehiculo?.matricula],
              ].map(([k, v]) => (
                <div key={k} style={{ fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: LITE_THEME.su }}>{k}: </span>
                  <span style={{ color: LITE_THEME.tx }}>{v ?? "—"}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div
            className="no-print lite-actions"
            style={{
              display: "flex",
              gap: 10,
              padding: "12px 14px",
              borderBottom: `1px solid ${LITE_THEME.line}`,
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: "rgba(255,255,255,.96)",
              backdropFilter: "blur(8px)",
            }}
          >
            <button
              type="button"
              onClick={handlePdf}
              disabled={pdfBusy}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 12,
                border: "none",
                background: `linear-gradient(135deg, ${LITE_THEME.navy}, ${LITE_THEME.blue})`,
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: pdfBusy ? "wait" : "pointer",
                boxShadow: "0 4px 14px rgba(3,105,161,.35)",
              }}
            >
              {pdfBusy ? "Generando PDF…" : "Descargar expediente PDF"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                minHeight: 48,
                minWidth: 48,
                padding: "0 16px",
                borderRadius: 12,
                border: `1px solid ${LITE_THEME.line}`,
                background: "#fff",
                color: LITE_THEME.tx,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
              aria-label="Imprimir"
            >
              🖨
            </button>
          </div>

          <div style={{ padding: compact ? "14px 14px 20px" : "18px 18px 24px" }}>
            <SectionTitle>Identificación</SectionTitle>
            <LiteMetaGrid doc={doc} />

            <SectionTitle>Resumen ejecutivo</SectionTitle>
            <LiteResumenEjecutivo resumen={doc.resumen} />

            <SectionTitle>Timeline operacional</SectionTitle>
            <LiteTimeline paradas={doc.paradas} />

            <SectionTitle>Evidencias</SectionTitle>
            <LiteEvidenciasGallery doc={doc} onPreview={handlePreview} />

            <LiteCierrePremium cierre={doc.cierre} resumen={doc.resumen} />
          </div>
        </div>
      </div>

      <LitePreviewModal preview={preview} onClose={() => setPreview(null)} />
    </>
  );
}
