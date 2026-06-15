import { useEffect, useState } from "react";
import { buildDecaDownloadUrl } from "../../domain/dcdt/decaUrl.js";
import { generateDecaQrDataUrl } from "../../domain/dcdt/decaQrImage.js";
import { downloadDecaQrPng } from "../../domain/dcdt/dcdtPdfDocument.js";

const UI = {
  overlay: "rgba(15,23,42,.5)",
  surface: "#ffffff",
  tx: "#0f172a",
  su: "#64748b",
  border: "#dbe4ee",
};

export function DcdtQrModal({
  decaPublicId = null,
  downloadUrl: downloadUrlProp = null,
  dcdt = null,
  numeroDcdt,
  onClose,
  showToast,
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const downloadUrl =
    downloadUrlProp ||
    dcdt?.datos?.deca_download_url ||
    (decaPublicId ? buildDecaDownloadUrl(decaPublicId, { allowBrowserOriginFallback: true }) : "");

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

  async function descargarPng() {
    if (!dcdt?.datos?.deca_qr_png_storage_path) {
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `DeCA-QR-${numeroDcdt || "servicio"}.png`;
      a.click();
      return;
    }
    setBusy(true);
    try {
      await downloadDecaQrPng(dcdt, `DeCA-QR-${numeroDcdt || "servicio"}.png`);
      showToast?.("QR DeCA descargado");
    } catch (e) {
      showToast?.(e?.message || "No se pudo descargar el QR");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: UI.overlay,
        zIndex: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.surface,
          borderRadius: 18,
          padding: "22px 20px",
          maxWidth: 360,
          width: "100%",
          border: `1px solid ${UI.border}`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx }}>QR DeCA</div>
        <div style={{ fontSize: 12, color: UI.su, marginTop: 6, lineHeight: 1.45 }}>
          {numeroDcdt || ""} · Descarga directa del PDF
        </div>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Codigo QR descarga DeCA"
            style={{ width: 280, height: 280, margin: "18px auto 8px", display: "block", borderRadius: 8 }}
          />
        ) : (
          <div style={{ padding: "40px 0", color: UI.su }}>Generando QR…</div>
        )}
        <div style={{ fontSize: 11, color: UI.su, lineHeight: 1.5, marginBottom: 12, wordBreak: "break-all" }}>
          {downloadUrl ? (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
              {downloadUrl}
            </a>
          ) : (
            "URL no disponible"
          )}
        </div>
        <div style={{ fontSize: 11, color: UI.su, lineHeight: 1.5, marginBottom: 16 }}>
          Escanee para descargar el documento DeCA (PDF). Sin login ni pagina intermedia.
        </div>
        <button
          type="button"
          disabled={busy || !dataUrl}
          onClick={descargarPng}
          style={{
            width: "100%",
            background: "#ecfdf5",
            color: "#166534",
            border: "1px solid #bbf7d0",
            borderRadius: 12,
            padding: "12px",
            fontWeight: 700,
            cursor: busy || !dataUrl ? "not-allowed" : "pointer",
            marginBottom: 8,
          }}
        >
          {busy ? "Descargando…" : "Descargar PNG del QR"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            background: "#f1f5f9",
            color: UI.tx,
            border: `1px solid ${UI.border}`,
            borderRadius: 12,
            padding: "12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
