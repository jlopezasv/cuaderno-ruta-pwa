import { useCallback, useEffect, useState } from "react";
import {
  createServiceMessage,
  formatServiceMessageClock,
  listServiceMessages,
} from "../../domain/messages/serviceMessagesApi.js";

const UI = Object.freeze({
  border: "#e2e8f0",
  tx: "#0f172a",
  muted: "#64748b",
  soft: "#f8fafc",
  accent: "#2563eb",
});

/**
 * Bloc de notas cronológico por servicio (no chat WhatsApp).
 * @param {"empresa"|"conductor"} audience
 */
export function ServiceMessagesPanel({
  servicio,
  audience = "conductor",
  senderName = "",
  senderRole = "conductor",
  canMarkForCustomerReport = false,
  showToast,
  compact = false,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [includeInReport, setIncludeInReport] = useState(false);
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => {
    if (!servicio?.id) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listServiceMessages(servicio.id);
      setMessages(rows);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [servicio?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const saved = await createServiceMessage({
        servicio,
        message: text,
        senderName,
        senderRole,
        includeInCustomerReport: canMarkForCustomerReport && includeInReport,
      });
      setMessages((prev) => [...prev, saved]);
      setDraft("");
      setIncludeInReport(false);
      showToast?.("Mensaje enviado", "#166534", 2200);
    } catch (e) {
      showToast?.(e?.message || "No se pudo enviar el mensaje", "#b91c1c", 3200);
    } finally {
      setSending(false);
    }
  };

  const count = messages.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: UI.tx }}>
          Mensajes ({count})
        </div>
        <div style={{ fontSize: 11, color: UI.muted }}>Interno · no visible al cliente</div>
      </div>

      <div
        style={{
          background: UI.soft,
          border: `1px solid ${UI.border}`,
          borderRadius: 10,
          padding: compact ? "10px 10px" : "12px 12px",
          maxHeight: compact ? 220 : 280,
          overflowY: "auto",
        }}
      >
        {loading ? (
          <div style={{ fontSize: 12, color: UI.muted }}>Cargando mensajes…</div>
        ) : !messages.length ? (
          <div style={{ fontSize: 12, color: UI.muted }}>Sin mensajes todavía.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((msg, i) => {
              const name = msg.sender_name || (msg.sender_role === "conductor" ? "Conductor" : "Tráfico");
              const time = formatServiceMessageClock(msg.created_at);
              const isOwn =
                audience === "conductor"
                  ? msg.sender_role === "conductor"
                  : msg.sender_role !== "conductor";
              return (
                <div
                  key={msg.id}
                  style={{
                    paddingBottom: i < messages.length - 1 ? 12 : 0,
                    borderBottom: i < messages.length - 1 ? `1px solid ${UI.border}` : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isOwn ? UI.accent : UI.tx,
                      marginBottom: 4,
                    }}
                  >
                    {name} · {time}
                    {msg.include_in_customer_report ? (
                      <span style={{ fontWeight: 500, color: UI.muted }}> · expediente cliente</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 13, color: UI.tx, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                    {msg.message}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribir mensaje…"
          rows={compact ? 2 : 3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: `1px solid ${UI.border}`,
            borderRadius: 9,
            padding: "10px 12px",
            fontSize: 14,
            color: UI.tx,
            resize: "vertical",
            minHeight: compact ? 56 : 72,
            background: "#fff",
          }}
        />
        {canMarkForCustomerReport ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              fontSize: 12,
              color: UI.muted,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={includeInReport}
              onChange={(e) => setIncludeInReport(e.target.checked)}
            />
            Incluir en expediente cliente
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !draft.trim()}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "10px 14px",
            borderRadius: 9,
            border: "none",
            background: sending || !draft.trim() ? "#94a3b8" : UI.accent,
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: sending || !draft.trim() ? "not-allowed" : "pointer",
          }}
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
