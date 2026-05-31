import { useEffect, useRef, useState } from "react";
import { isEmpresaServicioDocumentsDemoEnabled } from "../../../config/empresaServicioDocumentsDemo.js";
import {
  EMPRESA_DOC_ACCEPT,
  deleteServicioDocumentoEmpresa,
  empresaDocFileUrl,
  fetchServicioDocumentosEmpresa,
  isEmpresaDocUrlOpenable,
  triggerEmpresaDocDownload,
  uploadServicioDocumentoEmpresa,
} from "../../../domain/service/serviceEmpresaDocuments.js";

const fileNameEllipsisStyle = {
  display: "block",
  width: "100%",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  boxSizing: "border-box",
};

/**
 * Documentos subidos por la empresa al servicio (DEMO). Estilo alineado con Docs Lite / extras.
 * @param {'empresa'|'conductor'} role
 */
export function ServiceEmpresaDocumentsBlock({
  servicio,
  showToast,
  role = "conductor",
  uploaderDisplayName = "Empresa",
  tone = "light",
  compact = false,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const fileRef = useRef(null);

  const enabled = isEmpresaServicioDocumentsDemoEnabled();
  const allowUpload = role === "empresa";
  const allowDelete = role === "empresa";
  const sid = servicio?.id;

  async function reload() {
    if (!sid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLastError("");
    try {
      const list = await fetchServicioDocumentosEmpresa(sid);
      setRows(list);
    } catch (e) {
      setRows([]);
      const msg = e?.message || "No se pudo cargar documentos de empresa";
      setLastError(msg);
      if (!String(msg).includes("does not exist") && !String(msg).includes("PGRST205")) {
        showToast?.(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled || !sid) return undefined;
    void reload();
    const onRecarga = () => void reload();
    window.addEventListener("cuaderno-recargar-servicio", onRecarga);
    return () => window.removeEventListener("cuaderno-recargar-servicio", onRecarga);
  }, [enabled, sid]);

  if (!enabled || !servicio?.empresa_id) return null;

  const isDark = tone === "dark";
  const shell = isDark
    ? {
        bg: "rgba(15,23,42,.45)",
        border: "1px solid rgba(148,163,184,.12)",
        title: "#e2e8f0",
        sub: "#64748b",
        rowBg: "rgba(30,41,59,.5)",
        rowBorder: "rgba(148,163,184,.1)",
        rowTitle: "#f1f5f9",
        rowMeta: "#94a3b8",
        link: "#60a5fa",
        btnBg: "#3b82f6",
      }
    : {
        bg: "#ffffff",
        border: "1px solid #e2e8f0",
        title: "#64748b",
        sub: "#94a3b8",
        rowBg: "#f8fafc",
        rowBorder: "#f1f5f9",
        rowTitle: "#0f172a",
        rowMeta: "#64748b",
        link: "#2563eb",
        btnBg: "#0f172a",
      };

  function openDocument(row) {
    const url = empresaDocFileUrl(row);
    if (!isEmpresaDocUrlOpenable(url)) {
      showToast?.("Documento sin URL válida");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function downloadDocument(row) {
    if (!triggerEmpresaDocDownload(row)) {
      openDocument(row);
    }
  }

  async function handleDelete(row) {
    if (!row?.id || deletingId) return;
    const ok = window.confirm(`¿Eliminar este documento de empresa?\n\n${row.archivo_nombre || ""}`);
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await deleteServicioDocumentoEmpresa(row.id);
      showToast?.("Documento eliminado");
      await reload();
    } catch (err) {
      showToast?.(err?.message || "No se pudo eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !servicio) return;
    setSaving(true);
    setLastError("");
    try {
      const row = await uploadServicioDocumentoEmpresa({
        servicio,
        file,
        subidoPorNombre: uploaderDisplayName,
      });
      setModal(false);
      setRows((prev) => (prev.some((x) => x.id === row.id) ? prev : [row, ...prev]));
      showToast?.("Documento de empresa guardado");
      await reload();
      window.dispatchEvent(new Event("cuaderno-recargar-servicio"));
    } catch (err) {
      const msg = err?.message || "No se pudo subir el documento";
      setLastError(msg);
      showToast?.(msg);
    } finally {
      setSaving(false);
    }
  }

  const pickBtn = {
    width: "100%",
    padding: "12px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
    cursor: saving ? "default" : "pointer",
    opacity: saving ? 0.65 : 1,
  };

  return (
    <div
      style={{
        background: shell.bg,
        border: shell.border,
        borderRadius: compact ? 14 : 16,
        padding: compact ? "10px 12px 11px" : "12px 13px 14px",
        boxShadow: isDark ? "none" : "0 8px 22px rgba(15,23,42,.05)",
        maxWidth: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
      data-demo="documentos-empresa"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: compact ? 8 : 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: compact ? 11 : 10,
              color: shell.title,
              fontWeight: 800,
              letterSpacing: compact ? 0.2 : 0.6,
            }}
          >
            DOCUMENTOS EMPRESA
          </div>
          {!compact ? (
            <div style={{ fontSize: 11, color: shell.sub, marginTop: 3, lineHeight: 1.35 }}>
              Expediente compartido · solo lectura para el conductor
            </div>
          ) : null}
        </div>
        {allowUpload ? (
          <button
            type="button"
            onClick={() => setModal(true)}
            style={{
              flexShrink: 0,
              background: shell.btnBg,
              color: "white",
              border: "none",
              borderRadius: 10,
              padding: compact ? "7px 10px" : "8px 11px",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            + Subir
          </button>
        ) : null}
      </div>

      {lastError ? (
        <div style={{ fontSize: 11, color: "#b91c1c", marginBottom: 8, lineHeight: 1.35 }}>{lastError}</div>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 12, color: shell.sub, padding: "8px 0" }}>Cargando…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: shell.sub, padding: compact ? "4px 0" : "6px 0", opacity: 0.9 }}>
          {allowUpload ? "Ningún documento de empresa" : "La empresa aún no ha adjuntado documentos"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8, minWidth: 0 }}>
          {rows.map((r) => {
            const canOpen = isEmpresaDocUrlOpenable(empresaDocFileUrl(r));
            const rowBusy = deletingId === r.id;
            const quien = r.subido_por_nombre || uploaderDisplayName || "Empresa";
            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  columnGap: 10,
                  alignItems: "start",
                  border: `1px solid ${shell.rowBorder}`,
                  borderRadius: 12,
                  padding: compact ? "7px 9px" : "8px 10px",
                  background: shell.rowBg,
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: shell.rowTitle, lineHeight: 1.3 }}>
                    Documento empresa
                  </div>
                  {r.archivo_nombre ? (
                    <div
                      title={r.archivo_nombre}
                      style={{
                        ...fileNameEllipsisStyle,
                        marginTop: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: shell.rowMeta,
                      }}
                    >
                      {r.archivo_nombre}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 10, color: shell.rowMeta, marginTop: 4, ...fileNameEllipsisStyle }}>
                    {new Date(r.created_at).toLocaleString("es-ES", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {quien}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    flexShrink: 0,
                    alignItems: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    disabled={!canOpen || rowBusy}
                    onClick={() => openDocument(r)}
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: canOpen ? shell.link : shell.rowMeta,
                      background: "transparent",
                      border: "none",
                      cursor: canOpen && !rowBusy ? "pointer" : "default",
                      padding: 0,
                    }}
                  >
                    Ver
                  </button>
                  <button
                    type="button"
                    disabled={!canOpen || rowBusy}
                    onClick={() => downloadDocument(r)}
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: canOpen ? shell.link : shell.rowMeta,
                      background: "transparent",
                      border: "none",
                      cursor: canOpen && !rowBusy ? "pointer" : "default",
                      padding: 0,
                    }}
                  >
                    Descargar
                  </button>
                  {allowDelete ? (
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => void handleDelete(r)}
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: rowBusy ? shell.rowMeta : "#b91c1c",
                        background: "transparent",
                        border: "none",
                        cursor: rowBusy ? "default" : "pointer",
                        padding: 0,
                      }}
                    >
                      {rowBusy ? "…" : "Eliminar"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && allowUpload ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.4)",
            zIndex: 420,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => !saving && setModal(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "18px 18px 0 0",
              width: "100%",
              maxWidth: 480,
              padding: "16px 16px 28px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
              Subir documento empresa
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14, lineHeight: 1.4 }}>
              PDF, JPG, JPEG o PNG. Visible y descargable por el conductor asignado.
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={EMPRESA_DOC_ACCEPT}
              style={{ display: "none" }}
              onChange={(e) => void onPickFile(e)}
            />
            <button type="button" disabled={saving} style={pickBtn} onClick={() => fileRef.current?.click()}>
              {saving ? "Subiendo…" : "Elegir archivo"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setModal(false)}
              style={{
                ...pickBtn,
                marginTop: 8,
                background: "#fff",
                fontWeight: 650,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
