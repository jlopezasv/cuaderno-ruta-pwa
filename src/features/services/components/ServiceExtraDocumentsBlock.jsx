import { useEffect, useState } from "react";
import { uploadUserFile } from "../../../data/uploadUserPhoto";
import { EXTRA_DOC_TIPOS, fetchServicioDocumentosExtra, insertServicioDocumentoExtra } from "../../../domain/service/serviceExtraDocuments";

export function ServiceExtraDocumentsBlock({ servicio, showToast, uploaderName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [tipo, setTipo] = useState("ticket");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: "12px 13px 14px",
        boxShadow: "0 8px 22px rgba(15,23,42,.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, letterSpacing: 0.6 }}>DOCUMENTOS EXTRA</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, lineHeight: 1.35 }}>Archivos del viaje · no ligados a parada</div>
        </div>
        <button
          type="button"
          onClick={() => setModal(true)}
          style={{
            flexShrink: 0,
            background: "#0f172a",
            color: "white",
            border: "none",
            borderRadius: 10,
            padding: "8px 11px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          + Añadir
        </button>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: "#94a3b8", padding: "8px 0" }}>Cargando…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: "#94a3b8", padding: "6px 0" }}>Sin documentos extra</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                border: "1px solid #f1f5f9",
                borderRadius: 12,
                padding: "8px 10px",
                background: "#f8fafc",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
                  {tipoLabel(r.tipo)}
                  {r.archivo_nombre ? <span style={{ color: "#64748b", fontWeight: 600 }}> · {r.archivo_nombre}</span> : null}
                </div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                  {new Date(r.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {uploaderName ? ` · ${uploaderName}` : ""}
                </div>
                {r.descripcion ? <div style={{ fontSize: 11, color: "#475569", marginTop: 4, lineHeight: 1.35 }}>{r.descripcion}</div> : null}
              </div>
              {r.url && String(r.url).startsWith("http") ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 800, color: "#2563eb", flexShrink: 0 }}>
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
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Multa AP-7" style={{ width: "100%", marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" }} />
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
