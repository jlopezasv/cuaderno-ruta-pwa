import { getUserId, sbFetch } from "../../data/supabaseClient";

/**
 * Registro append-only en documentacion_envios.
 */
export async function logDocumentacionEnvio({
  servicioId,
  empresaId = null,
  destinatarios,
  destinatario = null,
  cc = "",
  asunto,
  mensaje,
  adjuntos,
  estado,
  errorDetalle = null,
  remitenteMostrado = null,
  replyTo = null,
  provider = null,
  providerMessageId = null,
  sentAt = null,
}) {
  const st = String(estado || "enviado").trim().toLowerCase();
  const sent =
    sentAt ??
    (st === "enviado" || st === "simulado" ? new Date().toISOString() : null);
  const para = String(destinatario || destinatarios || "").trim();
  const body = {
    servicio_id: servicioId,
    empresa_id: empresaId || null,
    destinatarios: String(destinatarios || para).trim(),
    destinatario: para || null,
    cc: String(cc || "").trim() || null,
    asunto: String(asunto || "").trim(),
    mensaje: mensaje?.trim() || null,
    adjuntos: Array.isArray(adjuntos) ? adjuntos : [],
    estado: st,
    error_detalle: errorDetalle || null,
    remitente_mostrado: remitenteMostrado || null,
    reply_to: replyTo || null,
    provider: provider || null,
    provider_message_id: providerMessageId || null,
    enviado_por: getUserId(),
    sent_at: sent,
  };

  const tryInsert = async (payload) => {
    const r = await sbFetch("/rest/v1/documentacion_envios", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return Array.isArray(data) ? data[0] : data;
  };

  let row = await tryInsert(body);
  if (row) return row;

  const fallback = { ...body };
  const stripKeys = [
    "provider",
    "provider_message_id",
    "destinatario",
    "remitente_mostrado",
    "reply_to",
    "empresa_id",
    "sent_at",
    "cc",
  ];
  for (const k of stripKeys) delete fallback[k];
  return tryInsert(fallback);
}
