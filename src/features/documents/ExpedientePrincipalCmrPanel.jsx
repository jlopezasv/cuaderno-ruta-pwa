import { useMemo, useState } from "react";
import { resolveEvidenciaDisplayImageUrl } from "../../domain/documents/operationalDocumentRecord.js";
import { expedienteSizeLabel } from "../../domain/documents/operationalDocumentRecord.js";
import {
  additionalEvidenceStopLabel,
  additionalEvidenceTypeLabel,
  extractPrincipalCmrOcrRows,
  formatExpedienteEvidenceDate,
  splitExpedienteEvidencias,
} from "../../domain/documents/expedientePrincipalCmrModel.js";
import { LazyDocumentThumb } from "./LazyDocumentThumb.jsx";

function resolveDownloadUrl(ev) {
  return ev?.originalUrl || ev?.displayImageUrl || resolveEvidenciaDisplayImageUrl(ev) || ev?.previewUrl || ev?.url || null;
}

function isPdfEvidence(ev, url) {
  const mime = ev?.mime_type || ev?.datos?.doc_meta?.mime_type || "";
  return mime.includes("pdf") || String(url || "").toLowerCase().includes(".pdf");
}

function sectionTitle(text) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 10,
      }}
    >
      {text}
    </div>
  );
}

function actionBtn(label, onClick, { primary = false } = {}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        background: primary ? "#0f172a" : "white",
        color: primary ? "white" : "#334155",
        border: primary ? "none" : "1px solid #cbd5e1",
        borderRadius: 9,
        padding: "9px 10px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function EvidenceThumbCard({ ev, panel, onOpen, onDownload }) {
  const thumb = ev.displayImageUrl || resolveEvidenciaDisplayImageUrl(ev) || ev.previewUrl || ev.url;
  const typeLabel = additionalEvidenceTypeLabel(ev);
  const stopLabel = additionalEvidenceStopLabel(ev);
  const dateLabel = formatExpedienteEvidenceDate(ev);
  const downloadUrl = resolveDownloadUrl(ev);

  return (
    <div
      style={{
        background: panel.rowBg,
        border: `1px solid ${panel.border}`,
        borderRadius: 10,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
      }}
    >
      <LazyDocumentThumb
        src={thumb}
        alt=""
        style={{ width: "100%", height: 88, borderRadius: 8, objectFit: "cover" }}
        onClick={() => onOpen?.(ev)}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: panel.tx, lineHeight: 1.3 }}>{typeLabel}</div>
        <div style={{ fontSize: 10, color: panel.su, marginTop: 3, lineHeight: 1.35 }}>{stopLabel}</div>
        <div style={{ fontSize: 10, color: panel.time, marginTop: 2, fontWeight: 600 }}>{dateLabel}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {actionBtn("Ver", () => onOpen?.(ev), { primary: true })}
        {downloadUrl ? actionBtn("Descargar", () => onDownload?.(ev, downloadUrl)) : null}
      </div>
    </div>
  );
}

/**
 * Expediente documental demo: CMR principal + datos OCR + miniaturas adicionales.
 */
export function ExpedientePrincipalCmrPanel({ expediente, onOpenDocument, tone = "light" }) {
  const [modalEv, setModalEv] = useState(null);
  const panel =
    tone === "dark"
      ? { rowBg: "#f8fafc", border: "#e2e8f0", tx: "#0f172a", su: "#64748b", time: "#94a3b8" }
      : { rowBg: "#f8fafc", border: "#e2e8f0", tx: "#0f172a", su: "#64748b", time: "#94a3b8" };

  const { principalCmr, additionalEvidencias } = useMemo(
    () => splitExpedienteEvidencias(expediente?.evidencias || []),
    [expediente?.evidencias],
  );

  const ocrRows = useMemo(() => extractPrincipalCmrOcrRows(principalCmr), [principalCmr]);
  const totalLabel = expediente?.storage?.totalLabel || expedienteSizeLabel(expediente?.evidencias);
  const count = expediente?.evidencias?.length || 0;

  function openDoc(ev) {
    if (onOpenDocument) {
      onOpenDocument(ev);
      return;
    }
    setModalEv(ev);
  }

  function downloadDoc(ev, url) {
    const href = url || resolveDownloadUrl(ev);
    if (!href) return;
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = ev?.datos?.doc_meta?.archivo_nombre || ev?.displayTitle || "documento";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!count) {
    return <div style={{ fontSize: 12, color: panel.su }}>Sin documentos en el expediente.</div>;
  }

  const principalUrl = principalCmr
    ? principalCmr.displayImageUrl || resolveEvidenciaDisplayImageUrl(principalCmr) || principalCmr.url
    : null;
  const principalDownload = principalCmr ? resolveDownloadUrl(principalCmr) : null;
  const principalPdf = principalCmr && isPdfEvidence(principalCmr, principalUrl);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: panel.tx }}>Expediente · {totalLabel}</div>
        <div style={{ fontSize: 11, color: panel.su, fontWeight: 600 }}>{count} documento{count === 1 ? "" : "s"}</div>
      </div>

      {principalCmr ? (
        <div style={{ marginBottom: 16 }}>
          {sectionTitle("CMR principal")}
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 12,
              padding: 12,
            }}
          >
            {principalUrl && !principalPdf ? (
              <img
                src={principalUrl}
                alt="CMR principal"
                style={{
                  width: "100%",
                  maxHeight: 220,
                  objectFit: "contain",
                  borderRadius: 10,
                  background: "#fff",
                  marginBottom: 10,
                }}
              />
            ) : principalPdf ? (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 10,
                  padding: "28px 16px",
                  textAlign: "center",
                  marginBottom: 10,
                  border: "1px solid #dbeafe",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>Documento PDF</div>
              </div>
            ) : null}
            <div style={{ fontSize: 12, color: panel.su, marginBottom: 8, lineHeight: 1.4 }}>
              <div>
                <strong style={{ color: panel.tx }}>Subido:</strong> {formatExpedienteEvidenceDate(principalCmr)}
              </div>
              <div>
                <strong style={{ color: panel.tx }}>Parada:</strong>{" "}
                {principalCmr.stopLabel || principalCmr.stopName || "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {principalUrl || principalDownload
                ? actionBtn("Ver", () => openDoc(principalCmr), { primary: true })
                : null}
              {principalDownload ? actionBtn("Descargar", () => downloadDoc(principalCmr, principalDownload)) : null}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {sectionTitle("Datos extraídos del CMR")}
              <div
                style={{
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 8,
                }}
              >
                {ocrRows.map((row) => (
                  <div
                    key={row.key}
                    style={{
                      background: row.detected ? "#f8fafc" : "#fafafa",
                      border: `1px solid ${row.detected ? "#e2e8f0" : "#f1f5f9"}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 3 }}>{row.label}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: row.detected ? "#0f172a" : "#94a3b8",
                        lineHeight: 1.35,
                        fontWeight: row.detected ? 600 : 500,
                      }}
                    >
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: panel.su, marginBottom: 14 }}>Sin CMR principal en el expediente.</div>
      )}

      {additionalEvidencias.length > 0 ? (
        <div>
          {sectionTitle("Evidencias adicionales")}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
              gap: 10,
            }}
          >
            {additionalEvidencias.map((ev) => (
              <EvidenceThumbCard
                key={ev.id || `${ev.tipo}-${ev.created_at}`}
                ev={ev}
                panel={panel}
                onOpen={openDoc}
                onDownload={downloadDoc}
              />
            ))}
          </div>
        </div>
      ) : null}

      {modalEv ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.55)",
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setModalEv(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: 14,
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                {additionalEvidenceTypeLabel(modalEv)}
              </div>
              <button
                type="button"
                onClick={() => setModalEv(null)}
                style={{
                  background: "#e2e8f0",
                  border: "none",
                  borderRadius: 8,
                  width: 30,
                  height: 30,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
              {additionalEvidenceStopLabel(modalEv)} · {formatExpedienteEvidenceDate(modalEv)}
            </div>
            {(() => {
              const url = modalEv.displayImageUrl || resolveEvidenciaDisplayImageUrl(modalEv) || modalEv.url;
              if (!url) return null;
              if (isPdfEvidence(modalEv, url)) {
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      textAlign: "center",
                      padding: 24,
                      background: "#f8fafc",
                      borderRadius: 10,
                      color: "#1d4ed8",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Abrir PDF
                  </a>
                );
              }
              return (
                <img
                  src={url}
                  alt=""
                  style={{ width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 10, background: "#f8fafc" }}
                />
              );
            })()}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {actionBtn("Cerrar", () => setModalEv(null))}
              {resolveDownloadUrl(modalEv)
                ? actionBtn("Descargar", () => downloadDoc(modalEv), { primary: true })
                : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
