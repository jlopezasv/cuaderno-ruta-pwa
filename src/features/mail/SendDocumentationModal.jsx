import { useEffect, useMemo, useRef, useState } from "react";
import { getServiceClient, getServiceNumberForDisplay } from "../../domain/service/serviceIdentity";
import { getDocumentLabel } from "../../domain/service/serviceDocuments";
import { extraDocFileUrl, fetchServicioDocumentosExtra } from "../../domain/service/serviceExtraDocuments.js";
import { makeServiceExpedientePdfBlob } from "../../domain/service/serviceExpediente.js";
import { logDocumentacionEnvio } from "../../domain/mail/documentacionEnviosLog";
import {
  buildClienteMailDefaults,
  buildClienteMailFrom,
  normalizeReplyToEmail,
} from "../../domain/mail/clienteMailSender.js";
import { uploadUserFile } from "../../data/uploadUserPhoto.js";
import { storageUploadUrl } from "../../domain/documents/mediaStorageV2.js";
import { isClienteMailEnhancedUiEnabled } from "../../config/productFeatures.js";
import { CLIENTE_MAIL_SIMULACION_OK_MSG } from "../../config/clienteMail.js";

const LS_HINTS = "cuaderno_cliente_email_hints";

const MAIL_EXTRA_TIPOS = [
  { id: "factura", label: "Factura" },
  { id: "albaran", label: "Albarán" },
  { id: "cmr", label: "CMR" },
  { id: "foto", label: "Foto" },
  { id: "otro", label: "Otro" },
];

/** Estilos producción (sin cambios visuales en este rediseño). */
const PROD_UI = {
  panelClass: "mail-compose-panel-prod",
  panelBg: "#f5f7fa",
  headerBg: "#fafafa",
  footerBg: "#fafafa",
  overlay: "rgba(17,24,39,.28)",
  sectionPad: "28px 36px",
  headerPad: "26px 36px 22px",
  footerPad: "20px 36px 24px",
  bodyInset: "20px 36px 0",
  titleSize: 22,
  subtitleSize: 14,
  fieldGap: 20,
  textareaMin: 180,
  labelStyle: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#475569",
    marginBottom: 8,
  },
  fieldStyle: {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    fontSize: 15,
    lineHeight: 1.5,
    outline: "none",
    boxShadow: "0 1px 2px rgba(15,23,42,.04)",
  },
  sectionTitleStyle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 22,
  },
  messageLabel: "Texto",
};

/** Estilos DEMO — modal amplio tipo Outlook/Gmail (solo VITE_APP_ENV=demo). */
const DEMO_UI = {
  panelClass: "mail-compose-panel-demo",
  panelBg: "#f7f8fa",
  headerBg: "#ffffff",
  footerBg: "#ffffff",
  overlay: "rgba(15,23,42,.2)",
  sectionPad: "clamp(24px, 4.5vw, 40px) clamp(20px, 5vw, 44px)",
  headerPad: "clamp(22px, 4vw, 32px) clamp(20px, 5vw, 44px) clamp(18px, 3vw, 24px)",
  footerPad: "clamp(16px, 3vw, 22px) clamp(20px, 5vw, 44px)",
  bodyInset: "0",
  titleSize: 24,
  subtitleSize: 15,
  fieldGap: 24,
  textareaMin: 180,
  labelStyle: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 10,
  },
  fieldStyle: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    fontSize: 16,
    lineHeight: 1.55,
    outline: "none",
    boxShadow: "0 1px 2px rgba(15,23,42,.05)",
  },
  sectionTitleStyle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: 24,
  },
  messageLabel: "Texto del correo",
};

const MAIL_MODAL_RESPONSIVE_CSS = `
  .mail-compose-panel-prod {
    width: 96vw;
    max-width: 900px;
  }
  @media (min-width: 640px) {
    .mail-compose-panel-prod {
      width: min(900px, 92vw);
    }
  }
  .mail-compose-panel-demo {
    width: 96vw;
    max-width: 900px;
  }
  @media (min-width: 480px) {
    .mail-compose-panel-demo {
      width: min(900px, 92vw);
    }
  }
  @media (min-width: 768px) and (max-width: 1200px) {
    .mail-compose-panel-demo {
      width: min(900px, 90vw);
    }
  }
`;

function attachmentDisplayName(item) {
  const fn = String(item?.filename || "").trim();
  if (fn) return fn.includes(".") ? fn : `${fn}.pdf`;
  if (item?.kind === "expediente_pdf") return "Expediente operacional.pdf";
  const label = String(item?.label || "Documento").trim();
  if (/\.(pdf|jpg|jpeg|png|webp)$/i.test(label)) return label;
  return `${label}.pdf`;
}

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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result;
      const b64 =
        typeof dataUrl === "string" && dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
      resolve(b64);
    };
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(blob);
  });
}

/**
 * Modal revisable: expediente PDF + adjuntos + envío (o simulación en demo sin Resend).
 */
export function SendDocumentationModal({
  open,
  onClose,
  servicio,
  stops,
  evidenciasByStop,
  extraDocs: extraDocsProp,
  showToast,
  onBuildExpediente,
  onEnvioLogged,
  empresaNombre = "",
  empresaId = null,
  replyToEmail = "",
}) {
  const serviceRef = useMemo(() => getServiceNumberForDisplay(servicio) || "SERV-000", [servicio]);
  const clienteNombre = useMemo(() => getServiceClient(servicio) || "—", [servicio]);
  const clienteKey = useMemo(() => String(clienteNombre || serviceRef || "").slice(0, 80), [clienteNombre, serviceRef]);
  const mailFrom = useMemo(() => buildClienteMailFrom(empresaNombre), [empresaNombre]);
  const replyTo = useMemo(() => normalizeReplyToEmail(replyToEmail), [replyToEmail]);
  const mailDefaults = useMemo(() => buildClienteMailDefaults(serviceRef), [serviceRef]);

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(mailDefaults.subject);
  const [message, setMessage] = useState(mailDefaults.message);
  const [items, setItems] = useState([]);
  const [sending, setSending] = useState(false);
  const [preparingPdf, setPreparingPdf] = useState(false);
  const [hints, setHints] = useState([]);
  const [extraDocs, setExtraDocs] = useState([]);
  const [extraTipo, setExtraTipo] = useState("factura");
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const preparedRef = useRef(false);
  const hadInputRef = useRef(false);

  useEffect(() => {
    if (!open || !servicio?.id) return;
    preparedRef.current = false;
    hadInputRef.current = false;
    const defs = buildClienteMailDefaults(getServiceNumberForDisplay(servicio) || "SERV-000");
    setSubject(defs.subject);
    setMessage(defs.message);
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
        if (!ev?.id || !ev?.url) return;
        const label = `${st.nombre || "Parada"} · ${getDocumentLabel(ev) || ev.tipo}`;
        list.push({
          id: `ev:${ev.id}`,
          key: ev.id,
          label,
          url: ev.url,
          filename: `${(ev.tipo || "doc").toUpperCase()}_${String(st.orden || "")}_${ev.id}.jpg`.slice(0, 120),
          selected: false,
          kind: "evidencia",
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
        selected: false,
        kind: "extra",
      });
    });
    setItems(list);
  }, [open, servicio, stops, evidenciasByStop, extraDocs]);

  useEffect(() => {
    if (!open || !servicio?.id || !onBuildExpediente || preparingPdf) return;
    let cancelled = false;
    (async () => {
      setPreparingPdf(true);
      try {
        const exp = await onBuildExpediente(servicio);
        if (cancelled || !exp) return;
        const blob = await makeServiceExpedientePdfBlob(exp);
        const b64 = await blobToBase64(blob);
        const filename = `${exp.filenameBase || "expediente-operacional"}.pdf`;
        setItems((prev) => {
          const without = prev.filter((x) => x.kind !== "expediente_pdf");
          return [
            {
              id: "expediente-pdf",
              key: "expediente-pdf",
              label: "Expediente operacional (PDF)",
              filename,
              content: b64,
              selected: true,
              kind: "expediente_pdf",
              required: true,
            },
            ...without,
          ];
        });
      } catch (e) {
        if (!cancelled) showToast?.(e?.message || "No se pudo generar el PDF del expediente");
      } finally {
        if (!cancelled) setPreparingPdf(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, servicio?.id, onBuildExpediente]);

  useEffect(() => {
    if (to.trim() || cc.trim() || message.trim()) hadInputRef.current = true;
  }, [to, cc, message]);

  if (!open || !servicio) return null;

  function toggle(id) {
    const row = items.find((x) => x.id === id);
    if (row?.required) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, selected: !x.selected } : x)));
  }

  function removeItem(id) {
    const row = items.find((x) => x.id === id);
    if (row?.required) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  function logEnvioBase(chosen) {
    return {
      servicioId: servicio.id,
      empresaId,
      destinatarios: to,
      destinatario: to.split(/[,;\n]+/)[0]?.trim() || to,
      cc,
      asunto: subject || mailDefaults.subject,
      mensaje: message,
      adjuntos: adjuntosLogPayload(chosen),
      remitenteMostrado: mailFrom.remitenteMostrado,
      replyTo: replyTo || null,
    };
  }

  async function handleAddExtraFile(file) {
    if (!file || !servicio?.id) return;
    setUploadingExtra(true);
    try {
      const folder = `mail-out/${servicio.id}`;
      const result = await uploadUserFile(file, folder, { requireHttpUrl: true });
      const url = storageUploadUrl(result);
      if (!url) throw new Error("No se pudo subir el archivo");
      const tipo = MAIL_EXTRA_TIPOS.find((t) => t.id === extraTipo)?.label || extraTipo;
      const name = file.name || `adjunto_${Date.now()}`;
      setItems((prev) => [
        ...prev,
        {
          id: `local:${Date.now()}`,
          key: `local-${Date.now()}`,
          label: `${tipo} · ${name}`,
          url,
          filename: name.slice(0, 120),
          selected: true,
          kind: "upload",
        },
      ]);
      showToast?.("Archivo añadido");
    } catch (e) {
      showToast?.(e?.message || "No se pudo subir el archivo");
    } finally {
      setUploadingExtra(false);
    }
  }

  function chosenAttachments() {
    return items.filter((x) => x.selected && (x.content || (x.url && String(x.url).startsWith("http"))));
  }

  function adjuntosLogPayload(chosen) {
    return chosen.map((c) => ({
      id: c.key,
      label: c.label,
      filename: c.filename,
      kind: c.kind,
    }));
  }

  function logSendToConsole(data, resultado) {
    console.log("[cliente-mail] resultado envío", {
      from: mailFrom.from,
      reply_to: replyTo || null,
      destinatario: to,
      cc: cc || null,
      asunto: subject || mailDefaults.subject,
      provider: data?.provider ?? null,
      resultado,
      provider_message_id: data?.provider_message_id ?? data?.id ?? null,
      error: data?.error ?? null,
    });
  }

  async function send() {
    const recipients = to
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!recipients.length) {
      showToast?.("Indica al menos un email en Para");
      return;
    }
    const chosen = chosenAttachments();
    if (!chosen.length) {
      showToast?.("Incluye al menos un documento (expediente PDF u otro)");
      return;
    }
    setSending(true);
    try {
      const attachments = await Promise.all(
        chosen.map(async (c) => {
          if (c.content) return { filename: c.filename, content: c.content };
          return { url: c.url, filename: c.filename };
        }),
      );
      const bodyText = message || mailDefaults.message;
      const r = await fetch("/api/send-docs-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: mailFrom.from,
          reply_to: replyTo || undefined,
          to,
          cc,
          subject: subject || mailDefaults.subject,
          text: bodyText,
          html: `<p>${bodyText.replace(/\n/g, "<br/>")}</p><p><strong>${serviceRef}</strong></p>`,
          attachments,
        }),
      });
      const data = await r.json().catch(() => ({}));
      const simulated =
        !!data.simulated ||
        data.provider === "simulacion" ||
        data.resultado === "simulado";
      const resultado =
        data.resultado || (data.ok ? (simulated ? "simulado" : "enviado") : "error");

      logSendToConsole(data, resultado);

      if (!r.ok || !data.ok) {
        const errMsg = data.error || `HTTP ${r.status}`;
        showToast?.(errMsg);
        await logDocumentacionEnvio({
          ...logEnvioBase(chosen),
          estado: "error",
          errorDetalle: errMsg,
          provider: data.provider || null,
        }).catch(() => {});
        onEnvioLogged?.();
        return;
      }

      recipients.forEach((em) => saveHint(clienteKey, em));

      if (simulated) {
        showToast?.(data.message || CLIENTE_MAIL_SIMULACION_OK_MSG);
        await logDocumentacionEnvio({
          ...logEnvioBase(chosen),
          estado: "simulado",
          errorDetalle: null,
          provider: "simulacion",
        }).catch(() => {});
        onEnvioLogged?.();
        onClose?.({ simulated: true });
        return;
      }

      if (data.resultado !== "enviado" || data.provider !== "resend") {
        const errMsg = data.error || "Respuesta de envío incompleta";
        showToast?.(errMsg);
        await logDocumentacionEnvio({
          ...logEnvioBase(chosen),
          estado: "error",
          errorDetalle: errMsg,
          provider: data.provider || "resend",
        }).catch(() => {});
        onEnvioLogged?.();
        return;
      }

      showToast?.("Correo enviado al cliente");
      await logDocumentacionEnvio({
        ...logEnvioBase(chosen),
        estado: "enviado",
        provider: "resend",
        providerMessageId: data.provider_message_id || data.id,
      }).catch(() => {});
      onEnvioLogged?.();
      onClose?.({ sent: true });
    } catch (e) {
      const errMsg = e?.message || "Error de red";
      showToast?.(errMsg);
      logSendToConsole({ error: errMsg }, "error");
      await logDocumentacionEnvio({
        ...logEnvioBase(chosenAttachments()),
        estado: "error",
        errorDetalle: errMsg,
        provider: null,
      }).catch(() => {});
      onEnvioLogged?.();
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    if (hadInputRef.current && !preparedRef.current) {
      preparedRef.current = true;
      const chosen = chosenAttachments();
      await logDocumentacionEnvio({
        ...logEnvioBase(chosen),
        destinatarios: to || "(sin destinatario)",
        destinatario: to || null,
        estado: "borrador",
      }).catch(() => {});
      onEnvioLogged?.();
    }
    onClose?.();
  }

  const expedienteItem = items.find((x) => x.kind === "expediente_pdf");
  const otrosItems = items.filter((x) => x.kind !== "expediente_pdf");
  const demoMailUi = isClienteMailEnhancedUiEnabled();
  const ui = demoMailUi ? DEMO_UI : PROD_UI;
  const sectionStyle = {
    padding: ui.sectionPad,
    borderBottom: "1px solid #e5e7eb",
  };

  return (
    <>
      <style>{MAIL_MODAL_RESPONSIVE_CSS}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: ui.overlay,
          zIndex: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "max(12px, 2vh)",
        }}
        onClick={() => !sending && void handleCancel()}
      >
        <div
          className={ui.panelClass}
          style={{
            background: ui.panelBg,
            borderRadius: demoMailUi ? 14 : 12,
            border: "1px solid #d1d5db",
            boxShadow: demoMailUi
              ? "0 28px 64px -16px rgba(15,23,42,.22)"
              : "0 25px 50px -12px rgba(15,23,42,.2)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "90vh",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: ui.headerPad,
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexShrink: 0,
              background: ui.headerBg,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: ui.titleSize,
                  fontWeight: 700,
                  color: "#111827",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.25,
                }}
              >
                Preparar envío al cliente
              </div>
              <div
                style={{
                  fontSize: ui.subtitleSize,
                  color: "#6b7280",
                  marginTop: demoMailUi ? 10 : 8,
                  lineHeight: 1.55,
                  maxWidth: demoMailUi ? "100%" : 520,
                }}
              >
                Revise destinatarios, mensaje y documentos antes del envío{demoMailUi ? "." : ""}
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: demoMailUi ? 12 : 10 }}>
                {serviceRef} · {clienteNombre}
              </div>
            </div>
            <button
              type="button"
              onClick={() => !sending && void handleCancel()}
              aria-label="Cerrar"
              style={{
                background: "#fff",
                border: "1px solid #d1d5db",
                color: "#6b7280",
                width: 40,
                height: 40,
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 20,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {demoMailUi ? (
              <div
                style={{
                  padding: "10px clamp(20px, 5vw, 44px)",
                  background: "#f0f4f8",
                  borderBottom: "1px solid #e5e7eb",
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.45,
                }}
              >
                Modo simulación: no se enviará ningún correo real.
              </div>
            ) : (
              <div
                style={{
                  margin: "20px 36px 0",
                  padding: "14px 18px",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#92400e",
                  lineHeight: 1.5,
                }}
              >
                Sin <strong>RESEND_API_KEY</strong> en el servidor, el envío se registra como{" "}
                <strong>simulación</strong> (🟠 Simulado), sin correo real.
              </div>
            )}

            <div
              style={{
                margin: demoMailUi ? 0 : "20px 36px 0",
                padding: demoMailUi ? "16px clamp(20px, 5vw, 44px)" : "16px 20px",
                background: "#fff",
                borderBottom: demoMailUi ? "1px solid #e5e7eb" : undefined,
                border: demoMailUi ? undefined : "1px solid #e5e7eb",
                borderRadius: demoMailUi ? 0 : 8,
                fontSize: 13,
                color: "#4b5563",
                lineHeight: 1.55,
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: "#374151" }}>De:</span> {mailFrom.displayName}{" "}
                <span style={{ color: "#9ca3af" }}>&lt;expedientes@cuadernoderutapro.es&gt;</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontWeight: 600, color: "#374151" }}>Responder a:</span>{" "}
                <span style={{ color: replyTo ? "#1d4ed8" : "#b45309" }}>
                  {replyTo || "Configura el email de contacto en la ficha de empresa"}
                </span>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={ui.sectionTitleStyle}>Destinatarios</div>
              <label style={ui.labelStyle}>Para</label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="trafico@cliente.com"
                list="doc-mail-hints-list"
                style={{ ...ui.fieldStyle, marginBottom: ui.fieldGap }}
              />
              <datalist id="doc-mail-hints-list">
                {hints.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
              <label style={ui.labelStyle}>CC</label>
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="copia@cliente.com (opcional)"
                style={ui.fieldStyle}
              />
            </div>

            <div style={sectionStyle}>
              <div style={ui.sectionTitleStyle}>Mensaje</div>
              <label style={ui.labelStyle}>Asunto</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ ...ui.fieldStyle, marginBottom: ui.fieldGap }}
              />
              <label style={ui.labelStyle}>{ui.messageLabel}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{
                  ...ui.fieldStyle,
                  minHeight: ui.textareaMin,
                  resize: "vertical",
                  fontFamily:
                    'Segoe UI, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
                }}
              />
            </div>

            <div style={{ ...sectionStyle, borderBottom: "none", paddingBottom: demoMailUi ? 40 : 32 }}>
              <div style={ui.sectionTitleStyle}>Documentos adjuntos</div>

              {demoMailUi ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 14,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#374151",
                  }}
                >
                  <span style={{ color: "#16a34a", fontSize: 18, lineHeight: 1 }} aria-hidden>
                    ✓
                  </span>
                  <span>Expediente operacional PDF</span>
                </div>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>
                  Expediente operacional PDF
                </div>
              )}
              {preparingPdf ? (
                <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>Generando PDF del expediente…</div>
              ) : expedienteItem ? (
                <AttachmentCard
                  item={expedienteItem}
                  onToggle={toggle}
                  onRemove={removeItem}
                  variant={demoMailUi ? "demo" : "prod"}
                />
              ) : (
                <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 20 }}>Esperando expediente PDF…</div>
              )}

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  margin: demoMailUi ? "32px 0 14px" : "28px 0 12px",
                }}
              >
                Adjuntos añadidos
              </div>
              {otrosItems.length === 0 ? (
                <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 24, lineHeight: 1.5 }}>
                  Marque documentos del servicio o use el botón para añadir archivos.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: demoMailUi ? 14 : 12,
                    marginBottom: 24,
                  }}
                >
                  {otrosItems.map((it) => (
                    <AttachmentCard
                      key={it.id}
                      item={it}
                      onToggle={toggle}
                      onRemove={removeItem}
                      variant={demoMailUi ? "demo" : "prod"}
                    />
                  ))}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: demoMailUi ? 16 : 14,
                  alignItems: "stretch",
                  paddingTop: demoMailUi ? 12 : 8,
                }}
              >
                <select
                  value={extraTipo}
                  onChange={(e) => setExtraTipo(e.target.value)}
                  style={{
                    ...ui.fieldStyle,
                    width: "auto",
                    minWidth: 160,
                    flex: demoMailUi ? "1 1 180px" : "0 1 200px",
                    maxWidth: "100%",
                    padding: "12px 14px",
                    fontSize: 14,
                  }}
                >
                  {MAIL_EXTRA_TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: demoMailUi ? "0 28px" : "0 24px",
                    minHeight: 48,
                    flex: demoMailUi ? "1 1 auto" : undefined,
                    borderRadius: 8,
                    border: "none",
                    background: uploadingExtra || sending ? "#9ca3af" : "#2563eb",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: uploadingExtra || sending ? "default" : "pointer",
                    boxShadow: uploadingExtra || sending ? "none" : "0 2px 8px rgba(37,99,235,.35)",
                  }}
                >
                  {uploadingExtra ? "Subiendo…" : "+ Añadir documento"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
                    disabled={uploadingExtra || sending}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleAddExtraFile(f);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: ui.footerPad,
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexShrink: 0,
              background: ui.footerBg,
              boxShadow: demoMailUi ? "0 -4px 16px rgba(15,23,42,.06)" : undefined,
            }}
          >
            <button
              type="button"
              disabled={sending}
              onClick={() => void handleCancel()}
              style={{
                background: "#fff",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "12px 28px",
                fontSize: 15,
                fontWeight: 600,
                cursor: sending ? "default" : "pointer",
                minWidth: 120,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={sending || preparingPdf}
              onClick={() => void send()}
              style={{
                background: sending || preparingPdf ? "#9ca3af" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 32px",
                fontSize: 15,
                fontWeight: 700,
                cursor: sending || preparingPdf ? "default" : "pointer",
                minWidth: 180,
                boxShadow: sending || preparingPdf ? "none" : "0 2px 8px rgba(37,99,235,.35)",
              }}
            >
              {sending ? "Simulando…" : "Enviar al cliente"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function AttachmentCard({ item, onToggle, onRemove, variant = "prod" }) {
  const name = attachmentDisplayName(item);
  const included = item.selected;
  const isDemo = variant === "demo";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: isDemo ? 16 : 14,
        padding: isDemo ? "16px 20px" : "14px 18px",
        borderRadius: isDemo ? 10 : 8,
        border: `1px solid ${included ? "#bfdbfe" : "#e5e7eb"}`,
        background: included ? "#fff" : isDemo ? "#f8fafc" : "#f9fafb",
        boxShadow: included
          ? isDemo
            ? "0 2px 8px rgba(37,99,235,.1)"
            : "0 1px 3px rgba(37,99,235,.08)"
          : "none",
        opacity: included ? 1 : 0.72,
      }}
    >
      <input
        type="checkbox"
        checked={item.selected}
        disabled={item.required}
        onChange={() => onToggle(item.id)}
        title={item.required ? "Incluido obligatoriamente" : "Incluir en el envío"}
        style={{ width: 18, height: 18, accentColor: "#2563eb", flexShrink: 0 }}
      />
      <span style={{ fontSize: isDemo ? 24 : 22, lineHeight: 1, flexShrink: 0 }} aria-hidden>
        📄
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: isDemo ? 16 : 15,
          fontWeight: isDemo ? 600 : 500,
          color: "#111827",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      {item.required ? (
        <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, flexShrink: 0 }}>Obligatorio</span>
      ) : (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          title="Eliminar adjunto"
          style={{
            flexShrink: 0,
            background: "#fff",
            border: "1px solid #fecaca",
            color: "#dc2626",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 6,
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          Eliminar
        </button>
      )}
    </div>
  );
}
