/** Estados de envío al cliente (pestaña Documentos, demo). */

export const ENVIO_CLIENTE_ESTADOS = Object.freeze({
  no_enviado: { id: "no_enviado", label: "No enviado", icon: "⚪", color: "#64748b", bg: "#f8fafc" },
  borrador: { id: "borrador", label: "Borrador preparado", icon: "🟠", color: "#b45309", bg: "#fffbeb" },
  enviado: { id: "enviado", label: "Enviado", icon: "🟢", color: "#15803d", bg: "#ecfdf5" },
  simulado: {
    id: "simulado",
    label: "Simulado",
    icon: "🟠",
    color: "#b45309",
    bg: "#fffbeb",
  },
  error: { id: "error", label: "Error", icon: "🔴", color: "#b91c1c", bg: "#fef2f2" },
});

export function resolveEnvioClienteEstado(raw) {
  const k = String(raw || "")
    .trim()
    .toLowerCase();
  if (k === "borrador") return ENVIO_CLIENTE_ESTADOS.borrador;
  if (k === "simulado") return ENVIO_CLIENTE_ESTADOS.simulado;
  if (k === "enviado") return ENVIO_CLIENTE_ESTADOS.enviado;
  if (k === "error") return ENVIO_CLIENTE_ESTADOS.error;
  return ENVIO_CLIENTE_ESTADOS.no_enviado;
}

/** Prioridad para elegir el último estado visible por servicio. */
const ESTADO_RANK = { error: 4, enviado: 3, simulado: 2, borrador: 1, no_enviado: 0 };

export function pickLatestEnvioRow(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return [...rows].sort((a, b) => {
    const ta = new Date(a.sent_at || a.created_at || 0).getTime();
    const tb = new Date(b.sent_at || b.created_at || 0).getTime();
    if (tb !== ta) return tb - ta;
    const ra = ESTADO_RANK[String(a.estado || "").toLowerCase()] ?? 1;
    const rb = ESTADO_RANK[String(b.estado || "").toLowerCase()] ?? 1;
    return rb - ra;
  })[0];
}

export function formatEnvioClienteDetalle(row) {
  if (!row) return "";
  const st = String(row.estado || "").toLowerCase();
  const when = row.sent_at || row.created_at;
  const ts = when
    ? new Date(when).toLocaleString("es-ES", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const to = String(row.destinatario || row.destinatarios || "").trim();
  const cc = String(row.cc || "").trim();
  const parts = [];
  if (st === "simulado") parts.push("Simulado (sin email real)");
  if (ts) parts.push(ts);
  if (to) parts.push(to);
  if (cc) parts.push(`CC: ${cc}`);
  return parts.join(" · ");
}
