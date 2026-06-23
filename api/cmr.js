// api/cmr.js — Escaner CMR con Claude Vision
import { requireAuthenticatedUser } from "./_lib/cmrAuth.js";
import { tryConsumeCmrOcrQuota } from "./_lib/cmrOcrUsage.js";

const MAX_IMAGE_B64_CHARS = 2 * 1024 * 1024;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
      code: "CMR_METHOD_NOT_ALLOWED",
    });
  }

  const auth = await requireAuthenticatedUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      code: auth.code,
    });
  }

  const { image, mediaType = "image/jpeg" } = req.body || {};
  if (!image) {
    return res.status(400).json({
      ok: false,
      error: "No image provided",
      code: "CMR_BAD_REQUEST",
    });
  }

  const b64 = String(image);
  if (b64.length > MAX_IMAGE_B64_CHARS) {
    return res.status(413).json({
      ok: false,
      error: "Imagen demasiado grande (máx. 2 MB en base64). Sube el CMR como documento sin OCR.",
      code: "CMR_IMAGE_TOO_LARGE",
    });
  }

  const quota = await tryConsumeCmrOcrQuota(auth.uid);
  if (!quota.ok) {
    return res.status(quota.status).json({
      ok: false,
      error: quota.error,
      code: quota.code,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(503).json({
      ok: false,
      error: "OCR no disponible: configure ANTHROPIC_API_KEY en el proyecto Vercel (entorno demo).",
      code: "CMR_OCR_NOT_CONFIGURED",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            },
            {
              type: "text",
              text: `Analiza esta imagen de un documento CMR (carta de porte internacional) y extrae los datos.
Devuelve SOLO un JSON valido sin markdown, con estos campos (usa null si no encuentras el dato):
{
  "num_cmr": "numero del CMR",
  "fecha": "fecha en formato DD/MM/YYYY",
  "remitente": "nombre y direccion del remitente",
  "destinatario": "nombre y direccion del destinatario",
  "transportista": "nombre del transportista o empresa",
  "lugar_carga": "lugar de carga",
  "lugar_entrega": "lugar de entrega/destino",
  "mercancia": "descripcion de la mercancia",
  "peso_kg": numero en kg o null,
  "bultos": numero de bultos o null,
  "matricula": "matricula del vehiculo",
  "observaciones": "observaciones relevantes"
}
Si es una foto de mala calidad o no es un CMR, devuelve {"error": "No se pudo leer el documento"}.`,
            },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[cmr] anthropic_error", {
        httpStatus: response.status,
        errorType: data?.error?.type ?? data?.type ?? null,
        errorMessage: data?.error?.message ?? (typeof data?.error === "string" ? data.error : null),
      });

      const upstreamMsg = data?.error?.message || data?.error || "CMR upstream error";
      const friendly =
        /x-api-key|authentication|invalid.*key/i.test(String(upstreamMsg))
          ? "Clave Anthropic inválida o ausente (ANTHROPIC_API_KEY en Vercel demo)."
          : upstreamMsg;
      return res.status(502).json({
        ok: false,
        error: friendly,
        code: "CMR_UPSTREAM",
        debug: {
          anthropicHttpStatus: response.status,
          anthropicErrorType: data?.error?.type ?? data?.type ?? null,
          anthropicErrorMessage: data?.error?.message ?? null,
        },
      });
    }
    const text = data.content?.[0]?.text || "";

    const clean = text.replace(/```json|```/g, "").trim();
    const campos = JSON.parse(clean);

    return res.status(200).json({ ok: true, campos });
  } catch (e) {
    const parseError = e instanceof SyntaxError;
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error processing CMR",
      code: parseError ? "CMR_PARSE_ERROR" : "CMR_INTERNAL",
    });
  }
}
