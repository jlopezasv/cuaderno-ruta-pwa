import { useEffect, useRef, useState } from "react";
import {
  EXTRA_DOC_TIPOS,
  extraDocFileUrl,
  fetchServicioDocumentosExtra,
  isExtraDocUrlOpenable,
  deleteServicioDocumentoExtra,
  uploadServicioDocumentoExtra,
} from "../../../domain/service/serviceExtraDocuments.js";
import { logExtraDoc } from "../../../domain/documents/extraDocumentUploadLog.js";
import { sanitizeDocumentCommentText } from "../../../domain/documents/documentCommentSanitize.js";
import { getCameraInputProps, isMobileCaptureDevice } from "../../../domain/documents/universalCamera.js";

/** Truncado fiable en flex/grid móvil (nombre de archivo). */
const fileNameEllipsisStyle = {
  display: "block",
  width: "100%",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  boxSizing: "border-box",
};

export function ServiceExtraDocumentsBlock({
  servicio,
  showToast,
  uploaderName,
  tone = "light",
  compact = false,
  openAddRequestVersion = 0,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [tipo, setTipo] = useState("ticket");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const lastOpenReq = useRef(0);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const pdfRef = useRef(null);
  const mobile = isMobileCaptureDevice();

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
      const list = await fetchServicioDocumentosExtra(sid);
      setRows(list);
    } catch (e) {
      setRows([]);
      const msg = e?.message || "No se pudo cargar la lista";
      setLastError(msg);
      showToast?.(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [sid]);

  useEffect(() => {
    if (!openAddRequestVersion || openAddRequestVersion === lastOpenReq.current) return;
    lastOpenReq.current = openAddRequestVersion;
    setModal(true);
  }, [openAddRequestVersion]);

  function openDocument(row) {
    const url = extraDocFileUrl(row);
    if (!isExtraDocUrlOpenable(url)) {
      showToast?.("Documento sin URL valida — vuelve a subirlo");
      logExtraDoc("DOCUMENT_VER_FAIL", { id: row?.id, url: url ? String(url).slice(0, 40) : null });
      return;
    }
    logExtraDoc("DOCUMENT_VER_OK", { id: row?.id, urlPrefix: String(url).slice(0, 72) });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(row) {
    if (!row?.id || deletingId) return;
    const label = row.archivo_nombre || tipoLabel(row.tipo);
    const ok = window.confirm(`¿Eliminar este documento?\n\n${label}`);
    if (!ok) return;
    setDeletingId(row.id);
    setLastError("");
    try {
      await deleteServicioDocumentoExtra(row.id);
      showToast?.("Documento eliminado");
      await reload();
    } catch (err) {
      const msg = err?.message || "No se pudo eliminar el documento";
      setLastError(msg);
      showToast?.(msg);
    } finally {
      setDeletingId(null);
    }
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !sid || !servicio) return;
    setSaving(true);
    setLastError("");
    try {
      const row = await uploadServicioDocumentoExtra({
        servicio,
        file,
        tipo,
        descripcion: desc,
      });
      setModal(false);
      setDesc("");
      setRows((prev) => {
        if (prev.some((x) => x.id === row.id)) return prev;
        return [row, ...prev];
      });
      showToast?.("Documento extra guardado");
      await reload();
    } catch (err) {
      const msg = err?.message || "No se pudo guardar el documento";
      setLastError(msg);
      showToast?.(msg);
    } finally {
      setSaving(false);
    }
  }

  const tipoLabel = (t) => EXTRA_DOC_TIPOS.find((x) => x.id === t)?.label || t;

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
        desc: "#cbd5e1",
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
        desc: "#475569",
        link: "#2563eb",
        btnBg: "#0f172a",
      };

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
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: compact ? 8 : 10 }}>
        <div>
          <div style={{ fontSize: compact ? 11 : 10, color: shell.title, fontWeight: 800, letterSpacing: compact ? 0.2 : 0.6 }}>
            {compact ? "ARCHIVOS ADICIONALES PROD TEST" : "DOCUMENTOS EXTRA"}
          </div>
          {!compact ? (
            <div style={{ fontSize: 11, color: shell.sub, marginTop: 3, lineHeight: 1.35 }}>No ligados a una parada concreta</div>
          ) : null}
        </div>
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
          + Anadir
        </button>
      </div>
      {lastError ? (
        <div style={{ fontSize: 11, color: "#b91c1c", marginBottom: 8, lineHeight: 1.35 }}>{lastError}</div>
      ) : null}
      {loading ? (
        <div style={{ fontSize: 12, color: shell.sub, padding: "8px 0" }}>Cargando…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: shell.sub, padding: compact ? "4px 0" : "6px 0", opacity: 0.9 }}>Ningun archivo</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8, minWidth: 0, maxWidth: "100%" }}>
          {rows.map((r) => {
            const canOpen = isExtraDocUrlOpenable(extraDocFileUrl(r));
            const comentario = sanitizeDocumentCommentText(r.descripcion);
            const rowBusy = deletingId === r.id;
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
                  maxWidth: "100%",
                  overflow: "hidden",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: shell.rowTitle, lineHeight: 1.3 }}>
                    {tipoLabel(r.tipo)}
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
                        lineHeight: 1.3,
                      }}
                    >
                      {r.archivo_nombre}
                    </div>
                  ) : null}
                  <div
                    style={{
                      fontSize: 10,
                      color: shell.rowMeta,
                      marginTop: r.archivo_nombre ? 4 : 6,
                      lineHeight: 1.3,
                      ...fileNameEllipsisStyle,
                    }}
                  >
                    {new Date(r.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {uploaderName ? ` · ${uploaderName}` : ""}
                  </div>
                  {comentario ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: shell.desc,
                        marginTop: 4,
                        lineHeight: 1.35,
                        ...fileNameEllipsisStyle,
                      }}
                    >
                      {comentario}
                    </div>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    flexShrink: 0,
                    paddingTop: 1,
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
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
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Nuevo documento extra</div>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>TIPO</div>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ width: "100%", marginBottom: 10, padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }}>
              {EXTRA_DOC_TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>DESCRIPCION (opcional)</div>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ej. ticket repostaje, parking, peaje…"
              style={{ width: "100%", marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 8 }}>ARCHIVO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {mobile ? (
                <button type="button" disabled={saving} style={pickBtn} onClick={() => cameraRef.current?.click()}>
                  Hacer foto
                </button>
              ) : null}
              <button type="button" disabled={saving} style={pickBtn} onClick={() => galleryRef.current?.click()}>
                {mobile ? "Galeria (foto)" : "Elegir foto"}
              </button>
              <button type="button" disabled={saving} style={pickBtn} onClick={() => pdfRef.current?.click()}>
                Elegir PDF
              </button>
              {saving ? <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>Subiendo…</div> : null}
            </div>
            <input ref={cameraRef} {...getCameraInputProps({ facing: "environment" })} style={{ display: "none" }} disabled={saving} onChange={onPickFile} />
            <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} disabled={saving} onChange={onPickFile} />
            <input ref={pdfRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }} disabled={saving} onChange={onPickFile} />
            <button type="button" onClick={() => setModal(false)} style={{ width: "100%", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: 11, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
