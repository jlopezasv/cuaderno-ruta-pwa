import { useEffect, useMemo, useRef, useState } from "react";
import { sbFetch } from "../../data/supabaseClient.js";
import { uploadOperationalDocument } from "../../data/uploadOperationalDocument.js";
import { DOCUMENT_TYPES } from "../../domain/service/serviceDocuments.js";
import { enrichEvidenciaDisplay, mergeDocMetaIntoDatos } from "../../domain/documents/operationalDocumentRecord.js";
import { processOperationalDocumentImage, formatStorageBytes } from "../../domain/documents/operationalDocumentPipeline.js";
import { isOperationalDocTraceEnabled, traceOperationalDoc } from "../../domain/documents/operationalDocumentTrace.js";
import { getCameraInputProps, isMobileCaptureDevice } from "../../domain/documents/universalCamera.js";
import { geoFromGpsPoint } from "../../domain/service/operationalGeo.js";
import { tryDriverGeoSnapshot } from "../../data/driverActionGps.js";
import { OperationalDocumentRow } from "./OperationalDocumentRow.jsx";
import { notifyEvidenciaSaved } from "../../domain/documents/operationalEvidenciaSync.js";

const CMR_FIELDS = [
  { k: "num_cmr", l: "Nº CMR" },
  { k: "fecha", l: "Fecha" },
  { k: "remitente", l: "Remitente" },
  { k: "destinatario", l: "Destinatario" },
  { k: "transportista", l: "Transportista" },
  { k: "lugar_carga", l: "Lugar de carga" },
  { k: "lugar_entrega", l: "Lugar de entrega" },
  { k: "mercancia", l: "Mercancía" },
  { k: "peso_kg", l: "Peso (kg)" },
  { k: "matricula", l: "Matrícula" },
  { k: "observaciones", l: "Observaciones" },
];

/**
 * Evidencias de parada con captura universal, pipeline documental y nombres operativos.
 * Compatible con API anterior de EvidenciasStop.
 */
export function OperationalEvidenciasStop({
  stopId,
  servicioId = null,
  servicio = null,
  stop = null,
  conductorName = null,
  conductorId = null,
  showToast,
  variant = "default",
  onEvidenciaSaved,
  tiposPermitidos = null,
  onOpenDocument = null,
}) {
  const [evidencias, setEvidencias] = useState([]);
  const [modal, setModal] = useState(null);
  const [nota, setNota] = useState("");
  const [cmrFase, setCmrFase] = useState("scan");
  const [cmrCampos, setCmrCampos] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const fotoRef = useRef(null);
  const previewBlobRef = useRef(null);
  /** Archivo CMR original de cámara/galería; el PDF y storage deben usar este, no solo previewBlob. */
  const cmrSourceFileRef = useRef(null);

  const allowedTipos = useMemo(() => {
    if (!Array.isArray(tiposPermitidos) || !tiposPermitidos.length) return null;
    return new Set(tiposPermitidos.map((t) => String(t || "").toLowerCase()));
  }, [tiposPermitidos]);

  const isDocsShell = variant === "docsShell";
  const LIGHT = { card: "#FFFFFF", bg: "#F8FAFC", tx: "#0F172A", su: "#64748B" };
  const panel = isDocsShell
    ? { rowBg: "rgba(30,41,59,.78)", tx: "#F8FAFC", su: "#94A3B8", border: "rgba(148,163,184,0.14)", time: "#64748B", head: "rgba(248,250,252,.92)" }
    : { rowBg: LIGHT.bg, tx: LIGHT.tx, su: LIGHT.su, border: "#E2E8F0", time: "#334155", head: LIGHT.su };
  const iStyle = {
    width: "100%",
    background: LIGHT.bg,
    border: "1.5px solid #CBD5E1",
    borderRadius: 9,
    padding: "11px 13px",
    fontSize: 15,
    color: LIGHT.tx,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 8,
  };

  const uploadContext = useMemo(
    () => ({
      servicio: servicio || (servicioId ? { id: servicioId } : null),
      stop: stop || (stopId ? { id: stopId, nombre: stop?.nombre } : null),
      conductorName,
      conductorId,
      cliente: servicio?.cliente,
      ciudad: stop?.nombre,
    }),
    [servicio, servicioId, stop, stopId, conductorName, conductorId],
  );

  useEffect(() => {
    if (!stopId) return;
    sbFetch(`/rest/v1/evidencias?stop_id=eq.${stopId}&order=created_at.asc`)
      .then((r) => r.json())
      .then((d) => setEvidencias(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [stopId]);

  const visibleEvs = useMemo(() => {
    const list = !allowedTipos ? evidencias : evidencias.filter((ev) => allowedTipos.has(String(ev?.tipo || "").toLowerCase()));
    return list.map((ev) => enrichEvidenciaDisplay(ev, { stop, conductorName }));
  }, [evidencias, allowedTipos, stop, conductorName]);

  const canTipo = (t) => !allowedTipos || allowedTipos.has(String(t || "").toLowerCase());

  async function captureUploadGeo() {
    const point = await tryDriverGeoSnapshot({ timeoutMs: 10000 });
    return geoFromGpsPoint(point);
  }

  async function persistEvidencia(tipo, { url = null, datos = null } = {}) {
    const body = {
      stop_id: stopId,
      tipo,
      url,
      datos: datos || null,
      nota: nota || null,
    };
    const r = await sbFetch("/rest/v1/evidencias", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await r.json();
    } catch {
      payload = null;
    }
    if (!r.ok) {
      const msg = payload?.message || payload?.hint || `Error al guardar (${r.status})`;
      throw new Error(msg);
    }
    const saved = Array.isArray(payload) ? payload[0] : payload;
    if (!saved?.id) throw new Error("No se guardó la evidencia");
    if (isOperationalDocTraceEnabled()) {
      const meta = saved?.datos?.doc_meta;
      traceOperationalDoc("persistEvidencia:supabase_row", {
        fn: "persistEvidencia",
        tipo,
        evId: saved.id,
        evidencias_url_column: saved.url ?? url,
        preview_url_meta: meta?.preview_url ?? null,
        original_url_meta: meta?.original_url ?? null,
        mime: meta?.mime_type ?? null,
        sizePreviewBytes: meta?.size_preview_bytes ?? null,
      });
    }
    setEvidencias((prev) => [...prev, saved]);
    notifyEvidenciaSaved({
      ev: saved,
      stopId,
      servicioId: servicioId || servicio?.id || null,
    });
    onEvidenciaSaved?.(saved);
    return saved;
  }

  async function guardarEvidencia(tipo, datos) {
    setSaving(true);
    setError("");
    try {
      await persistEvidencia(tipo, { datos });
      setModal(null);
      setNota("");
      showToast?.("✅ Evidencia guardada");
    } catch (e) {
      setError("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function preparePreview(file) {
    if (isOperationalDocTraceEnabled()) {
      traceOperationalDoc("OperationalEvidenciasStop:preparePreview", {
        documentMode: false,
        note: "UI-only; upload vuelve a procesar en uploadOperationalDocument",
      });
    }
    const processed = await processOperationalDocumentImage(file, { documentMode: false });
    previewBlobRef.current = processed.previewBlob;
    const url = URL.createObjectURL(processed.previewBlob);
    setPreviewUrl(url);
    setPreviewMeta({
      bytes: processed.previewBytes,
      label: formatStorageBytes(processed.previewBytes),
    });
    return processed;
  }

  async function onFotoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      if (isOperationalDocTraceEnabled()) {
        traceOperationalDoc("OperationalEvidenciasStop:onFotoSelected", {
          route: "uploadOperationalDocument",
          tipo: "foto",
          processImage: true,
        });
      }
      await preparePreview(file);
      const geo = await captureUploadGeo();
      const { previewUrl: url, docMeta } = await uploadOperationalDocument(file, {
        folder: "stops",
        tipo: "foto",
        context: { ...uploadContext, eventoOperacional: "Foto operativa", geo },
      });
      const datos = mergeDocMetaIntoDatos({}, docMeta);
      await persistEvidencia("foto", { url, datos });
      setModal(null);
      setNota("");
      revokePreview();
      showToast?.("✅ Foto guardada");
    } catch (err) {
      setError("Error: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  function revokePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewMeta(null);
    previewBlobRef.current = null;
    cmrSourceFileRef.current = null;
  }

  async function escanearCmr(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    cmrSourceFileRef.current = file;
    setError("");
    setCmrFase("procesando");
    try {
      await preparePreview(file);
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(previewBlobRef.current || file);
      });
      if (isOperationalDocTraceEnabled()) {
        traceOperationalDoc("OperationalEvidenciasStop:escanearCmr_ocr", {
          ocrBranch: true,
          api: "/api/cmr",
        });
      }
      const resp = await fetch("/api/cmr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, mediaType: "image/jpeg" }),
      });
      const data = await resp.json();
      if (data.ok && data.campos) {
        setCmrCampos(data.campos);
        setCmrFase("revisar");
      } else {
        setError(data.error || "No se pudo leer el CMR");
        setCmrFase("revisar");
      }
    } catch (err) {
      setError("Error: " + (err?.message || err));
      setCmrFase("scan");
    }
  }

  async function guardarCmr() {
    setSaving(true);
    setError("");
    try {
      let url = null;
      let datos = { ...cmrCampos };
      const sourceFile = cmrSourceFileRef.current;
      if (sourceFile) {
        if (isOperationalDocTraceEnabled()) {
          traceOperationalDoc("OperationalEvidenciasStop:guardarCmr_upload", {
            route: "uploadOperationalDocument",
            tipo: "cmr",
            documentModeExpected: true,
          });
        }
        const geo = await captureUploadGeo();
        const up = await uploadOperationalDocument(sourceFile, {
          folder: "cmr",
          tipo: "cmr",
          context: { ...uploadContext, eventoOperacional: "CMR escaneado", geo },
        });
        url = up.previewUrl;
        datos = mergeDocMetaIntoDatos(cmrCampos, up.docMeta);
      }
      await persistEvidencia("cmr", { url, datos });
      setModal(null);
      setNota("");
      setCmrFase("scan");
      setCmrCampos({});
      revokePreview();
      showToast?.("✅ CMR guardado");
    } catch (e) {
      setError("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  const cameraProps = getCameraInputProps({ facing: "environment" });
  const gBtn = (bg, bd, pd) => ({
    background: bg,
    border: bd,
    borderRadius: 12,
    padding: pd,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: isDocsShell ? 3 : 4,
  });

  return (
    <div style={{ marginTop: isDocsShell ? 6 : 16 }}>
      {visibleEvs.length > 0 && (
        <div style={{ marginBottom: isDocsShell ? 8 : 12 }}>
          <div style={{ fontSize: 10, color: panel.head, fontWeight: 800, marginBottom: 6, letterSpacing: isDocsShell ? 0.6 : 0, textTransform: isDocsShell ? "uppercase" : "none" }}>
            {isDocsShell ? "En esta parada" : "EXPEDIENTE DOCUMENTAL"} ({visibleEvs.length})
          </div>
          {visibleEvs.map((ev) => (
            <OperationalDocumentRow
              key={ev.id}
              ev={ev}
              panel={panel}
              compact={isDocsShell}
              onOpen={(row) => onOpenDocument?.(row) || (row.url && window.open(row.url, "_blank", "noopener"))}
            />
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isDocsShell ? 6 : 8 }}>
        {canTipo("foto") && (
          <button type="button" onClick={() => { setModal("foto"); setError(""); }} style={gBtn(isDocsShell ? "rgba(34,197,94,.14)" : "#22C55E20", isDocsShell ? "1px solid rgba(34,197,94,.38)" : "1.5px solid #22C55E50", isDocsShell ? "10px 4px" : "12px 6px")}>
            <span style={{ fontSize: isDocsShell ? 22 : 24 }}>📸</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isDocsShell ? "#86EFAC" : "#22C55E" }}>Foto</span>
          </button>
        )}
        {canTipo("cmr") && (
          <button type="button" onClick={() => { setModal("cmr"); setCmrFase("scan"); setError(""); revokePreview(); }} style={gBtn(isDocsShell ? "rgba(56,189,248,.12)" : "#0EA5E920", isDocsShell ? "1px solid rgba(56,189,248,.35)" : "1.5px solid #0EA5E950", isDocsShell ? "10px 4px" : "12px 6px")}>
            <span style={{ fontSize: isDocsShell ? 22 : 24 }}>📄</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isDocsShell ? "#7DD3FC" : "#0EA5E9" }}>CMR</span>
          </button>
        )}
        {canTipo("incidencia") && (
          <button type="button" onClick={() => { setModal("incidencia"); setNota(""); setError(""); }} style={gBtn(isDocsShell ? "rgba(248,113,113,.12)" : "#EF444420", isDocsShell ? "1px solid rgba(248,113,113,.35)" : "1.5px solid #EF444450", isDocsShell ? "10px 4px" : "12px 6px")}>
            <span style={{ fontSize: isDocsShell ? 22 : 24 }}>⚠️</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isDocsShell ? "#FCA5A5" : "#EF4444" }}>Incidencia</span>
          </button>
        )}
        {canTipo("nota") && (
          <button type="button" onClick={() => { setModal("nota"); setNota(""); setError(""); }} style={gBtn(isDocsShell ? "rgba(148,163,184,.14)" : "#64748B20", isDocsShell ? "1px solid rgba(148,163,184,.28)" : "1.5px solid #64748B50", isDocsShell ? "10px 4px" : "12px 6px")}>
            <span style={{ fontSize: isDocsShell ? 22 : 24 }}>📝</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isDocsShell ? "#CBD5E1" : "#64748B" }}>Nota</span>
          </button>
        )}
      </div>

      {modal === "cmr" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => { setModal(null); revokePreview(); }}>
          <div style={{ background: LIGHT.card, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0EA5E9" }}>📄 Documento CMR</div>
                <div style={{ fontSize: 11, color: LIGHT.su, marginTop: 2 }}>{isMobileCaptureDevice() ? "Cámara trasera" : "Cámara o archivo"} · optimizado para lectura</div>
              </div>
              <button type="button" onClick={() => { setModal(null); revokePreview(); }} style={{ background: "#E2E8F0", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "16px 18px 40px" }}>
              <input ref={fileRef} {...cameraProps} onChange={escanearCmr} style={{ display: "none" }} />
              {cmrFase === "scan" && (
                <>
                  <button type="button" onClick={() => fileRef.current?.click()} style={{ width: "100%", background: "#F59E0B", color: "#0F172A", border: "none", borderRadius: 13, padding: "18px", fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}>
                    📷 Capturar CMR
                  </button>
                  {!isMobileCaptureDevice() && (
                    <div style={{ fontSize: 11, color: LIGHT.su, marginBottom: 10 }}>En PC puedes elegir cámara web o imagen guardada.</div>
                  )}
                </>
              )}
              {cmrFase === "procesando" && (
                <div style={{ textAlign: "center", padding: "30px 0" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#F59E0B" }}>Procesando documento…</div>
                </div>
              )}
              {previewUrl && cmrFase !== "scan" && (
                <img src={previewUrl} alt="Vista previa CMR" style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 10, marginBottom: 10, background: "#f1f5f9" }} />
              )}
              {previewMeta && <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginBottom: 10 }}>Preview · {previewMeta.label}</div>}
              {cmrFase === "revisar" && (
                <div>
                  <div style={{ background: "#DCFCE7", border: "1px solid #86EFAC", borderRadius: 9, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#16A34A" }}>Revisa datos y confirma</div>
                  {CMR_FIELDS.map(({ k, l }) => (
                    <div key={k}>
                      <div style={{ fontSize: 11, color: LIGHT.su, fontWeight: 700, marginBottom: 3 }}>{l.toUpperCase()}</div>
                      <input value={cmrCampos[k] || ""} onChange={(e) => setCmrCampos((p) => ({ ...p, [k]: e.target.value }))} placeholder={l} style={iStyle} />
                    </div>
                  ))}
                  {error && <div style={{ background: "#FEE2E2", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#DC2626", marginBottom: 10 }}>{error}</div>}
                  <button type="button" onClick={guardarCmr} disabled={saving} style={{ width: "100%", background: saving ? "#CBD5E1" : "#22C55E", color: "white", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                    {saving ? "⏳ Guardando…" : "✅ Guardar CMR"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modal === "foto" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setModal(null)}>
          <div style={{ background: LIGHT.card, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, padding: "16px 18px 40px" }} onClick={(e) => e.stopPropagation()}>
            <input ref={fotoRef} {...cameraProps} onChange={onFotoSelected} style={{ display: "none" }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: "#22C55E", marginBottom: 12 }}>📸 Foto documental</div>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota opcional…" style={iStyle} />
            <button type="button" onClick={() => fotoRef.current?.click()} disabled={saving} style={{ width: "100%", background: "#22C55E", color: "white", border: "none", borderRadius: 13, padding: "18px", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
              {saving ? "⏳ Procesando…" : "📷 Capturar"}
            </button>
          </div>
        </div>
      )}

      {modal === "incidencia" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setModal(null)}>
          <div style={{ background: LIGHT.card, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, padding: "16px 18px 40px" }} onClick={(e) => e.stopPropagation()}>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Describe la incidencia…" rows={4} style={{ ...iStyle, resize: "vertical" }} />
            <button type="button" onClick={() => nota.trim() && guardarEvidencia("incidencia", { texto: nota })} disabled={saving || !nota.trim()} style={{ width: "100%", background: "#EF4444", color: "white", border: "none", borderRadius: 13, padding: "15px", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
              Registrar incidencia
            </button>
          </div>
        </div>
      )}

      {modal === "nota" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setModal(null)}>
          <div style={{ background: LIGHT.card, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, padding: "16px 18px 40px" }} onClick={(e) => e.stopPropagation()}>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Observación…" rows={4} style={{ ...iStyle, resize: "vertical" }} />
            <button type="button" onClick={() => nota.trim() && guardarEvidencia("nota", { texto: nota })} disabled={saving || !nota.trim()} style={{ width: "100%", background: "#64748B", color: "white", border: "none", borderRadius: 13, padding: "15px", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
              Guardar nota
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
