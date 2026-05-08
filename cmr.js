// api/cmr.js — Escáner CMR con Claude Vision
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, mediaType = "image/jpeg" } = req.body || {};
  if (!image) return res.status(400).json({ error: "No image provided" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
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
              source: { type: "base64", media_type: mediaType, data: image }
            },
            {
              type: "text",
              text: `Analiza esta imagen de un documento CMR (carta de porte internacional) y extrae los datos.
Devuelve SOLO un JSON válido sin markdown, con estos campos (usa null si no encuentras el dato):
{
  "num_cmr": "número del CMR",
  "fecha": "fecha en formato DD/MM/YYYY",
  "remitente": "nombre y dirección del remitente",
  "destinatario": "nombre y dirección del destinatario",
  "transportista": "nombre del transportista o empresa",
  "lugar_carga": "lugar de carga",
  "lugar_entrega": "lugar de entrega/destino",
  "mercancia": "descripción de la mercancía",
  "peso_kg": número en kg o null,
  "bultos": número de bultos o null,
  "matricula": "matrícula del vehículo",
  "observaciones": "observaciones relevantes"
}
Si es una foto de mala calidad o no es un CMR, devuelve {"error": "No se pudo leer el documento"}.`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    
    // Parse JSON response
    const clean = text.replace(/```json|```/g, "").trim();
    const campos = JSON.parse(clean);
    
    return res.json({ ok: true, campos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
