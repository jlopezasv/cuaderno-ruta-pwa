import { getUserId, sbFetch } from "../../data/supabaseClient";

export async function logDocumentacionEnvio({ servicioId, destinatarios, asunto, mensaje, adjuntos, estado, errorDetalle }) {
  const body = {
    servicio_id: servicioId,
    destinatarios: String(destinatarios || "").trim(),
    asunto: String(asunto || "").trim(),
    mensaje: mensaje?.trim() || null,
    adjuntos: Array.isArray(adjuntos) ? adjuntos : [],
    estado: estado || "enviado",
    error_detalle: errorDetalle || null,
    enviado_por: getUserId(),
  };
  const r = await sbFetch("/rest/v1/documentacion_envios", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return r.ok;
}
