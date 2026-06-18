import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultServiceDocMailSelection,
  readServiceDocMailPrefs,
  SERVICE_DOC_CATEGORY_META,
  SERVICE_DOC_CATEGORY_ORDER,
  writeServiceDocMailPrefs,
} from "../../domain/service/serviceDocumentCategories.js";
import {
  downloadCategoryPdf,
  downloadSelectedCategoryZip,
  loadServiceDocumentCategoryStatus,
} from "../../domain/service/serviceCategoryPdf.js";

const UI = Object.freeze({
  border: "#dbe2ea",
  headBg: "#f1f5f9",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#2563eb",
});

/**
 * Gestor documental por servicio: 3 categorías independientes (PDF, cabecera, envío cliente).
 */
export function ServicioDocumentosGestor({
  servicio,
  expediente = null,
  extraDocs = [],
  empresaNombre = null,
  empresaCif = null,
  showToast,
  onSendToCliente,
  compact = false,
}) {
  const servicioId = servicio?.id;
  const [mailPrefs, setMailPrefs] = useState(() => readServiceDocMailPrefs(servicioId));
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    setMailPrefs(readServiceDocMailPrefs(servicioId));
  }, [servicioId]);

  const refreshStatus = useCallback(async () => {
    if (!servicioId) {
      setStatus(null);
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const s = await loadServiceDocumentCategoryStatus({ servicio, expediente, extraDocs });
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [servicioId, servicio, expediente, extraDocs]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const selection = useMemo(() => defaultServiceDocMailSelection(mailPrefs), [mailPrefs]);

  const toggleSendToClient = (categoryId) => {
    if (!servicioId) return;
    setMailPrefs((prev) => {
      const next = { ...prev, [categoryId]: !prev[categoryId] };
      writeServiceDocMailPrefs(servicioId, next);
      return next;
    });
  };

  const handleDownload = async (categoryId) => {
    if (downloadingId) return;
    setDownloadingId(categoryId);
    try {
      await downloadCategoryPdf({
        categoryId,
        expediente,
        servicio,
        extraDocs,
        empresaNombre,
        empresaCif,
      });
      showToast?.("PDF descargado", "#166534", 2200);
    } catch (e) {
      showToast?.(e?.message || "No se pudo descargar el PDF", "#b91c1c", 3200);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleBulkDownload = async () => {
    const ids = SERVICE_DOC_CATEGORY_ORDER.filter((id) => selection[id] && status?.[id]?.available);
    if (!ids.length) {
      showToast?.("Marca al menos una categoría con PDF disponible", "#b45309", 2800);
      return;
    }
    setDownloadingId("bulk");
    try {
      if (ids.length === 1) {
        await downloadCategoryPdf({
          categoryId: ids[0],
          expediente,
          servicio,
          extraDocs,
          empresaNombre,
          empresaCif,
        });
        showToast?.("PDF descargado", "#166534", 2400);
        return;
      }
      await downloadSelectedCategoryZip({
        categoryIds: ids,
        expediente,
        servicio,
        extraDocs,
        empresaNombre,
        empresaCif,
      });
      showToast?.(`ZIP con ${ids.length} PDFs descargado`, "#166534", 2400);
    } catch (e) {
      showToast?.(e?.message || "No se pudo descargar la selección", "#b91c1c", 3200);
    } finally {
      setDownloadingId(null);
    }
  };

  const selectedForMail = SERVICE_DOC_CATEGORY_ORDER.filter((id) => selection[id] && status?.[id]?.available);

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${UI.border}`,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: compact ? 12 : 14,
      }}
    >
      <div
        style={{
          padding: compact ? "10px 12px" : "12px 14px",
          borderBottom: `1px solid ${UI.border}`,
          background: UI.headBg,
        }}
      >
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 800, color: UI.tx }}>
          Gestor de documentos
        </div>
        <div style={{ fontSize: 11, color: UI.muted, marginTop: 3, lineHeight: 1.35 }}>
          Tres categorías independientes · no se mezclan salvo envío explícito al cliente
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.4fr) auto auto",
          gap: "8px 10px",
          padding: "8px 12px",
          fontSize: 10,
          fontWeight: 800,
          color: UI.muted,
          textTransform: "uppercase",
          letterSpacing: 0.35,
          borderBottom: `1px solid ${UI.border}`,
          background: "#f8fafc",
        }}
      >
        <span>Categoría</span>
        <span>Cabecera / estado</span>
        <span style={{ textAlign: "center" }}>PDF</span>
        <span style={{ textAlign: "center" }}>Enviar al cliente</span>
      </div>

      {loadingStatus ? (
        <div style={{ padding: "14px 12px", fontSize: 12, color: UI.muted }}>Cargando documentos…</div>
      ) : (
        SERVICE_DOC_CATEGORY_ORDER.map((categoryId) => {
          const meta = SERVICE_DOC_CATEGORY_META[categoryId];
          const row = status?.[categoryId];
          const available = row?.available;
          const busy = downloadingId === categoryId;
          return (
            <div
              key={categoryId}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.4fr) auto auto",
                gap: "8px 10px",
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: `1px solid ${UI.border}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: UI.tx }}>{meta.label}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>{meta.headerTitle}</div>
                <div style={{ fontSize: 10.5, color: UI.muted, marginTop: 2, lineHeight: 1.35 }}>
                  {row?.statusLabel || "—"}
                  {row?.detail && row.detail !== "—" ? ` · ${row.detail}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  disabled={!available || busy}
                  onClick={() => void handleDownload(categoryId)}
                  style={{
                    background: available ? "#0f172a" : "#e2e8f0",
                    color: available ? "#fff" : "#94a3b8",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: available && !busy ? "pointer" : "default",
                    whiteSpace: "nowrap",
                  }}
                >
                  {busy ? "…" : "Descargar"}
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: UI.tx,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!mailPrefs[categoryId]}
                    onChange={() => toggleSendToClient(categoryId)}
                  />
                  {mailPrefs[categoryId] ? "Sí" : "No"}
                </label>
              </div>
            </div>
          );
        })
      )}

      <div
        style={{
          padding: compact ? "10px 12px" : "12px 14px",
          background: "#f8fafc",
          borderTop: `1px solid ${UI.border}`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: UI.muted, marginBottom: 8, textTransform: "uppercase" }}>
          Envío conjunto al cliente
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", marginBottom: 10 }}>
          {SERVICE_DOC_CATEGORY_ORDER.map((id) => (
            <label
              key={id}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: UI.tx }}
            >
              <input
                type="checkbox"
                checked={!!mailPrefs[id]}
                onChange={() => toggleSendToClient(id)}
              />
              {SERVICE_DOC_CATEGORY_META[id].label}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {onSendToCliente ? (
            <button
              type="button"
              disabled={!selectedForMail.length}
              onClick={() => onSendToCliente({ selection: { ...mailPrefs }, categories: selectedForMail })}
              style={{
                background: selectedForMail.length ? UI.accent : "#cbd5e1",
                color: "#fff",
                border: "none",
                borderRadius: 9,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 800,
                cursor: selectedForMail.length ? "pointer" : "default",
              }}
            >
              Enviar por email ({selectedForMail.length})
            </button>
          ) : null}
          <button
            type="button"
            disabled={!selectedForMail.length || !!downloadingId}
            onClick={() => void handleBulkDownload()}
            style={{
              background: "#fff",
              color: UI.tx,
              border: `1px solid ${UI.border}`,
              borderRadius: 9,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 800,
              cursor: selectedForMail.length && !downloadingId ? "pointer" : "default",
            }}
          >
            Descargar selección
          </button>
          <span
            style={{
              alignSelf: "center",
              fontSize: 10.5,
              color: UI.muted,
              fontWeight: 600,
            }}
          >
            Varios PDFs → un ZIP
          </span>
        </div>
      </div>
    </div>
  );
}
