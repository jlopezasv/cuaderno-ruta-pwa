// api/deca-vivo-inspect.js — Vista pública mínima DeCA actual (inspección carretera)
import { getSupabaseServiceRoleKey, getSupabaseServerEnv } from "./_lib/supabaseEnv.js";
import { DECA_VIVO_LEGAL_REFS } from "../src/domain/dcdt/decaVivoConstants.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function srHeaders() {
  const key = getSupabaseServiceRoleKey();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStockRows(stock) {
  if (!Array.isArray(stock) || !stock.length) {
    return "<p><em>Sin mercancía registrada a bordo.</em></p>";
  }
  const items = stock
    .map((line) => {
      const desc = escHtml(line.descripcion_mercancia || "—");
      const cat = line.categoria_mercancia ? escHtml(line.categoria_mercancia) + ": " : "";
      const qty =
        line.cantidad_actual != null
          ? `${escHtml(line.cantidad_actual)} ${escHtml(line.unidad || "ud.")}`
          : "";
      const peso =
        line.peso_kg_actual != null
          ? `${Number(line.peso_kg_actual).toLocaleString("es-ES")} kg`
          : "";
      const mag = [qty, peso].filter(Boolean).join(" / ");
      const dest = line.destino_previsto ? ` — destino ${escHtml(line.destino_previsto)}` : "";
      return `<li><strong>${cat}${desc}</strong>${mag ? `: ${mag}` : ""}${dest}</li>`;
    })
    .join("");
  return `<ul>${items}</ul>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const token = String(req.query?.token || "").trim();
  if (!UUID_RE.test(token)) {
    return res.status(400).send("Token inválido");
  }

  try {
    const { url } = getSupabaseServerEnv();
    const rpcUrl = `${url}/rest/v1/rpc/obtener_deca_inspeccion_por_token`;
    const r = await fetch(rpcUrl, {
      method: "POST",
      headers: srHeaders(),
      body: JSON.stringify({ p_qr_token: token }),
    });

    if (!r.ok) {
      return res.status(404).send("DeCA no encontrado o no vigente");
    }

    const data = await r.json();
    if (!data || typeof data !== "object") {
      return res.status(404).send("DeCA no encontrado");
    }

    const stock = data.stock_actual || [];
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>DeCA — Inspección</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 24px auto; padding: 0 16px; color: #0f172a; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .legal { font-size: 0.75rem; color: #64748b; margin-bottom: 1rem; }
    .meta { font-size: 0.875rem; margin-bottom: 1rem; }
    .note { font-size: 0.8rem; color: #64748b; margin-top: 1.5rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
  </style>
</head>
<body>
  <h1>Documento de Control Administrativo — DeCA actual</h1>
  <p class="legal">${escHtml(data.referencia_normativa || DECA_VIVO_LEGAL_REFS)}</p>
  <div class="meta">
    <p><strong>Versión:</strong> ${escHtml(data.version)}</p>
    <p><strong>Actualizado:</strong> ${escHtml(data.fecha_actualizacion || "—")}</p>
    <p><strong>Matrícula:</strong> ${escHtml(data.matricula_tractora || "—")}${data.matricula_remolque ? " / " + escHtml(data.matricula_remolque) : ""}</p>
    <p><strong>Cargador:</strong> ${escHtml(data.cargador_contractual_nombre || "—")}</p>
    <p><strong>Transportista:</strong> ${escHtml(data.transportista_efectivo_nombre || "—")}</p>
  </div>
  <h2>Carga actual del camión</h2>
  ${formatStockRows(stock)}
  <p class="note">${escHtml(data.nota || "Documento generado a partir de la trazabilidad operativa del servicio.")}</p>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(html);
  } catch (e) {
    console.error("[deca-vivo-inspect]", e);
    return res.status(500).send("Error al cargar DeCA");
  }
}
