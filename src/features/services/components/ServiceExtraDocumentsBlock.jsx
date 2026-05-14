import { useEffect, useRef, useState } from "react";
import { uploadUserFile } from "../../../data/uploadUserPhoto";
import { EXTRA_DOC_TIPOS, fetchServicioDocumentosExtra, insertServicioDocumentoExtra } from "../../../domain/service/serviceExtraDocuments";

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
  const lastOpenReq = useRef(0);

  const sid = servicio?.id;

  async function reload() {
    if (!sid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchServicioDocumentosExtra(sid));
    } catch {
      setRows([]);
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

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !sid) return;
    setSaving(true);
    try {
      const url = await uploadUserFile(file, "servicio_extra");
      await insertServicioDocumentoExtra({
        servicioId: sid,
        tipo,
        descripcion: desc,
        url,
        archivoNombre: file.name,
      });
      setModal(false);
      setDesc("");
      showToast?.("Documento extra guardado");
      await reload();
    } catch (err) {
      showToast?.(err?.message || "No se pudo subir (¿migración SQL en Supabase?)");
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

  return (
    <div
      style={{
        background: shell.bg,
        border: shell.border,
        borderRadius: compact ? 14 : 16,
        padding: compact ? "10px 12px 11px" : "12px 13px 14px",
        boxShadow: isDark ? "none" : "0 8px 22px rgba(15,23,42,.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: compact ? 8 : 10 }}>
        <div>
          <div style={{ fontSize: compact ? 11 : 10, color: shell.title, fontWeight: 800, letterSpacing: compact ? 0.2 : 0.6 }}>
            {compact ? "Archivos adicionales" : "DOCUMENTOS EXTRA"}
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
          + Añadir
        </button>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: shell.sub, padding: "8px 0" }}>Cargando…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: shell.sub, padding: compact ? "4px 0" : "6px 0", opacity: 0.9 }}>Ningún archivo</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                border: `1px solid ${shell.rowBorder}`,
                borderRadius: 12,
                padding: compact ? "7px 9px" : "8px 10px",
                background: shell.rowBg,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: shell.rowTitle }}>
                  {tipoLabel(r.tipo)}
                  {r.archivo_nombre ? <span style={{ color: shell.rowMeta, fontWeight: 600 }}> · {r.archivo_nombre}</span> : null}
                </div>
                <div style={{ fontSize: 10, color: shell.rowMeta, marginTop: 2 }}>
                  {new Date(r.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {uploaderName ? ` · ${uploaderName}` : ""}
                </div>
                {r.descripcion ? <div style={{ fontSize: 11, color: shell.desc, marginTop: 4, lineHeight: 1.35 }}>{r.descripcion}</div> : null}
              </div>
              {r.url && String(r.url).startsWith("http") ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 800, color: shell.link, flexShrink: 0 }}>
                  Abrir
                </a>
              ) : null}
            </div>
          ))}
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
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>DESCRIPCIÓN (opcional)</div>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. ticket repostaje, parking, peaje…" style={{ width: "100%", marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" }} />
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>ARCHIVO</div>
            <label style={{ display: "block", width: "100%", textAlign: "center", padding: "14px", borderRadius: 12, border: "2px dashed #cbd5e1", cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1 }}>
              <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} disabled={saving} onChange={onPickFile} />
              {saving ? "Subiendo…" : "Elegir foto o PDF"}
            </label>
            <button type="button" onClick={() => setModal(false)} style={{ width: "100%", marginTop: 12, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: 11, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
