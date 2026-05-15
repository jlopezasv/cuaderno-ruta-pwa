import { useEffect, useMemo, useState } from "react";
import { getFixedServiceRoute, getServiceClient } from "../../domain/service/serviceIdentity";
import { getDocumentLabel } from "../../domain/service/serviceDocuments";
import { extraDocFileUrl, fetchServicioDocumentosExtra } from "../../domain/service/serviceExtraDocuments.js";
import { logDocumentacionEnvio } from "../../domain/mail/documentacionEnviosLog";

const LS_HINTS = "cuaderno_cliente_email_hints";

function readHints(clienteKey) {
  try {
    const raw = localStorage.getItem(LS_HINTS);
    const all = raw ? JSON.parse(raw) : {};
    return Array.isArray(all[clienteKey]) ? all[clienteKey] : [];
  } catch {
    return [];
  }
}

function saveHint(clienteKey, email) {
  const e = String(email || "").trim();
  if (!e || !e.includes("@")) return;
  try {
    const raw = localStorage.getItem(LS_HINTS);
    const all = raw ? JSON.parse(raw) : {};
    const cur = Array.isArray(all[clienteKey]) ? all[clienteKey] : [];
    if (!cur.includes(e)) {
      all[clienteKey] = [e, ...cur].slice(0, 12);
      localStorage.setItem(LS_HINTS, JSON.stringify(all));
    }
  } catch (_) {}
}

export function SendDocumentationModal({ open, onClose, servicio, stops, evidenciasByStop, extraDocs: extraDocsProp, showToast }) {
  const routeTitle = useMemo(() => (servicio ? getFixedServiceRoute(servicio) : ""), [servicio]);
  const clienteKey = useMemo(() => String(getServiceClient(servicio) || routeTitle || "").slice(0, 80), [servicio, routeTitle]);
  const defaultSubject = useMemo(() => `Documentación servicio ${routeTitle}`.slice(0, 200), [routeTitle]);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState([]);
  const [sending, setSending] = useState(false);
  const [hints, setHints] = useState([]);
  const [extraDocs, setExtraDocs] = useState([]);

  useEffect(() => {
    if (!open || !servicio?.id) return;
    setSubject(`Documentación servicio ${getFixedServiceRoute(servicio)}`.slice(0, 200));
    setHints(readHints(clienteKey));
    let cancelled = false;
    (async () => {
      const ex = Array.isArray(extraDocsProp) ? extraDocsProp : await fetchServicioDocumentosExtra(servicio.id);
      if (cancelled) return;
      setExtraDocs(ex);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, servicio, clienteKey, extraDocsProp]);

  useEffect(() => {
    if (!open || !servicio) return;
    const list = [];
    (stops || []).forEach((st) => {
      const evs = evidenciasByStop?.[st.id] || [];
      evs.forEach((ev) => {
        if (!ev?.id) return;
        const label = `${st.nombre || "Parada"} · ${getDocumentLabel(ev) || ev.tipo}`;
        list.push({
          id: `ev:${ev.id}`,
          key: ev.id,
          label,
          url: ev.url,
          filename: `${(ev.tipo || "doc").toUpperCase()}_${String(st.orden || "")}_${ev.id}.jpg`.slice(0, 120),
          selected: true,
        });
      });
    });
    (extraDocs || []).forEach((ex) => {
      const exUrl = extraDocFileUrl(ex);
      if (!ex?.id || !exUrl) return;
      list.push({
        id: `ex:${ex.id}`,
        key: ex.id,
        label: `Extra · ${ex.tipo}${ex.archivo_nombre ? ` (${ex.archivo_nombre})` : ""}`,
        url: exUrl,
        filename: (ex.archivo_nombre || `extra_${ex.tipo}.pdf`).slice(0, 120),
        selected: true,
      });
    });
    setItems(list);
  }, [open, servicio, stops, evidenciasByStop, extraDocs]);

  if (!open || !servicio) return null;

  function toggle(id) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, selected: !x.selected } : x)));
  }

  async function send() {
    const recipients = to
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!recipients.length) {
      showToast?.("Indica al menos un email");
      return;
    }
    const chosen = items.filter((x) => x.selected && x.url && String(x.url).startsWith("http"));
    if (!chosen.length) {
      showToast?.("Selecciona documentos con enlace válido");
      return;
    }
    setSending(true);
    try {
      const r = await fetch("/api/send-docs-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject: subject || defaultSubject,
          text: message || `Adjuntamos documentación del servicio.\n\n${routeTitle}`,
          html: `<p>${(message || "Adjuntamos documentación del servicio.").replace(/\n/g, "<br/>")}</p><p><strong>${routeTitle}</strong></p>`,
          attachments: chosen.map((c) => ({ url: c.url, filename: c.filename })),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        showToast?.(data.error || "No se pudo enviar");
        await logDocumentacionEnvio({
          servicioId: servicio.id,
          destinatarios: to,
          asunto: subject || defaultSubject,
          mensaje: message,
          adjuntos: chosen.map((c) => ({ id: c.key, label: c.label })),
          estado: "error",
          errorDetalle: data.error || `HTTP ${r.status}`,
        }).catch(() => {});
        return;
      }
      showToast?.("Correo enviado");
      recipients.forEach((em) => saveHint(clienteKey, em));
      await logDocumentacionEnvio({
        servicioId: servicio.id,
        destinatarios: to,
        asunto: subject || defaultSubject,
        mensaje: message,
        adjuntos: chosen.map((c) => ({ id: c.key, label: c.label })),
        estado: "enviado",
      }).catch(() => {});
      onClose?.();
    } catch (e) {
      showToast?.(e?.message || "Error de red");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }} onClick={() => !sending && onClose?.()}>
      <div style={{ background: "#0f172a", borderRadius: 16, maxWidth: 440, width: "100%", border: "1px solid rgba(148,163,184,.2)", boxShadow: "0 24px 60px rgba(0,0,0,.35)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(148,163,184,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc" }}>Enviar documentación</div>
          <button type="button" onClick={() => !sending && onClose?.()} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(148,163,184,.2)", color: "#94a3b8", width: 34, height: 34, borderRadius: 8, cursor: "pointer" }}>
            ✕
          </button>
        </div>
        <div style={{ padding: "14px 16px 18px", maxHeight: "78vh", overflowY: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", marginBottom: 4 }}>DESTINATARIO(S)</div>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="trafico@cliente.com, admin@..."
            list="doc-mail-hints-list"
            style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 10, border: "1px solid rgba(148,163,184,.25)", background: "rgba(30,41,59,.6)", color: "#f8fafc", marginBottom: 8, fontSize: 14 }}
          />
          <datalist id="doc-mail-hints-list">
            {hints.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", marginBottom: 4 }}>ASUNTO</div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 10, border: "1px solid rgba(148,163,184,.25)", background: "rgba(30,41,59,.6)", color: "#f8fafc", marginBottom: 10, fontSize: 14 }} />
          <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", marginBottom: 4 }}>MENSAJE (opcional)</div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 10, border: "1px solid rgba(148,163,184,.25)", background: "rgba(30,41,59,.6)", color: "#f8fafc", marginBottom: 12, fontSize: 13, resize: "vertical" }} />
          <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", marginBottom: 6 }}>ADJUNTOS</div>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>No hay documentos con URL para adjuntar.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {items.map((it) => (
                <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#e2e8f0", cursor: "pointer" }}>
                  <input type="checkbox" checked={it.selected} onChange={() => toggle(it.id)} style={{ accentColor: "#38bdf8" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={sending}
            onClick={send}
            style={{
              width: "100%",
              background: sending ? "#475569" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 12,
              padding: "13px",
              fontSize: 14,
              fontWeight: 800,
              cursor: sending ? "default" : "pointer",
            }}
          >
            {sending ? "Enviando…" : "ENVIAR"}
          </button>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 10, lineHeight: 1.4 }}>Requiere RESEND_API_KEY en el servidor. Historial en Supabase si existe la tabla.</div>
        </div>
      </div>
    </div>
  );
}
