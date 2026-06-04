import { resolveEnvioClienteEstado } from "../../domain/mail/clienteMailEnvioStatus.js";

function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function adjuntosLista(row) {
  const adj = row?.adjuntos;
  if (!Array.isArray(adj) || !adj.length) return "—";
  return adj.map((a) => a?.label || a?.filename || "Documento").join(", ");
}

/**
 * Detalle del último envío al cliente (pestaña Documentos, demo).
 */
export function EnvioClienteHistorialModal({ open, onClose, envio, serviceRef, nombreEnviador }) {
  if (!open || !envio) return null;
  const meta = resolveEnvioClienteEstado(envio.estado);
  const cuando = fmtWhen(envio.sent_at || envio.created_at);
  const dest = envio.destinatario || envio.destinatarios || "—";
  const cc = String(envio.cc || "").trim();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
        zIndex: 490,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          maxWidth: 420,
          width: "100%",
          border: "1px solid #e2e8f0",
          boxShadow: "0 20px 50px rgba(15,23,42,.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Último envío al cliente</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "14px 16px 18px", fontSize: 13, color: "#334155", lineHeight: 1.45 }}>
          {serviceRef ? (
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Servicio {serviceRef}</div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontWeight: 800, color: meta.color }}>
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </div>
          {envio.estado === "simulado" ? (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                background: "#fffbeb",
                borderRadius: 8,
                border: "1px solid #fde68a",
                color: "#92400e",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              Simulación de envío: no se ha enviado ningún correo real al cliente.
            </div>
          ) : null}
          {[
            ["Fecha/hora", cuando],
            ["Destinatario", dest],
            ...(cc ? [["CC", cc]] : []),
            ["Proveedor", envio.provider || "—"],
            ...(envio.provider_message_id ? [["ID proveedor", envio.provider_message_id]] : []),
            ["Adjuntos", adjuntosLista(envio)],
            ["Usuario", nombreEnviador || "—"],
            ["Remitente", envio.remitente_mostrado || "—"],
            ["Reply-To", envio.reply_to || "—"],
            ["Asunto", envio.asunto || "—"],
          ].map(([label, value]) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontWeight: 600, color: "#0f172a", wordBreak: "break-word" }}>{value}</div>
            </div>
          ))}
          {envio.estado === "error" && envio.error_detalle ? (
            <div style={{ marginTop: 8, padding: 10, background: "#fef2f2", borderRadius: 8, color: "#b91c1c", fontSize: 12 }}>
              {envio.error_detalle}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
