/**
 * Validación y simulación de envío de documentación al cliente.
 * Demo (VITE_APP_ENV=demo): solo simulación — sin proveedor de correo.
 * Producción: no activo hasta integrar Resend.
 */

import { getSupabaseServerEnv } from "./lib/supabaseEnv.js";
import {
  guardDemoCannotUseProduction,
  guardDemoCannotUseProductionInString,
} from "./lib/demoSafety.js";
import { isDemoApp } from "./lib/appEnvironment.js";

const DEMO_SIM_OK_MSG =
  "Simulación completada correctamente. No se ha enviado ningún correo real.";

function resolveSupabaseUrlForAttachments() {
  try {
    const { url } = getSupabaseServerEnv();
    guardDemoCannotUseProduction(url, "send-docs-email:module");
    return url;
  } catch (e) {
    if (isDemoApp()) throw e;
    return (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  }
}

const SB_URL = resolveSupabaseUrlForAttachments();

function logMailEvent(payload) {
  console.log("[send-docs-email]", JSON.stringify(payload, null, 2));
}

function isAllowedAttachmentFetchUrl(urlStr) {
  try {
    guardDemoCannotUseProductionInString(urlStr, "send-docs-email:attachment");
    const u = new URL(String(urlStr));
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h.endsWith(".local")) return false;
    if (isDemoApp()) {
      if (!SB_URL) return false;
      const base = new URL(SB_URL);
      return h === base.hostname.toLowerCase() && /\/storage\/v1\//.test(u.pathname);
    }
    if (h.endsWith(".supabase.co") && /\/storage\/v1\//.test(u.pathname)) return true;
    if (SB_URL) {
      const base = new URL(SB_URL);
      if (h === base.hostname.toLowerCase() && /\/storage\/v1\//.test(u.pathname)) return true;
    }
    return false;
  } catch (e) {
    if (isDemoApp() && e?.message === "DEMO CANNOT USE PRODUCTION") throw e;
    return false;
  }
}

function parseEmails(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function resolveAttachment(a) {
  if (!a?.filename) return null;
  const filename = String(a.filename).slice(0, 180);
  if (a.content) {
    const content = String(a.content).replace(/^data:[^;]+;base64,/, "");
    if (!content) return null;
    return { filename, content };
  }
  if (!a.url) return null;
  if (!isAllowedAttachmentFetchUrl(a.url)) return null;
  try {
    const r = await fetch(a.url, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return { filename, content: buf.toString("base64") };
  } catch (_) {
    return null;
  }
}

function respondSimulacion(res, logBase, attachmentCount) {
  logMailEvent({
    ...logBase,
    provider: "simulacion",
    resultado: "simulado",
  });
  return res.status(200).json({
    ok: true,
    simulated: true,
    provider: "simulacion",
    resultado: "simulado",
    message: DEMO_SIM_OK_MSG,
    attachmentCount,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  if (!isDemoApp()) {
    return res.status(503).json({
      ok: false,
      error: "El envío por correo no está activo en este entorno",
      code: "MAIL_NOT_AVAILABLE",
      provider: null,
      resultado: "error",
    });
  }

  try {
    guardDemoCannotUseProduction(SB_URL, "send-docs-email:handler");
  } catch (e) {
    return res.status(503).json({ ok: false, error: e.message, code: "DEMO_SAFETY_BLOCKED" });
  }

  const { from: fromBody, reply_to: replyToBody, to, cc, subject, attachments = [] } = req.body || {};
  const from = String(fromBody || "").trim() || "Cuaderno de Ruta <expedientes@cuadernoderutapro.es>";
  const replyToList = parseEmails(replyToBody);
  const recipients = parseEmails(to);
  const ccList = parseEmails(cc);

  const logBase = {
    from,
    reply_to: replyToList.join(", ") || null,
    destinatario: recipients.join(", "),
    cc: ccList.join(", ") || null,
    asunto: subject,
    attachmentCount: attachments.length,
  };

  if (!recipients.length) {
    logMailEvent({ ...logBase, provider: null, resultado: "error", error: "Sin destinatarios" });
    return res.status(400).json({ ok: false, error: "Sin destinatarios", provider: null, resultado: "error" });
  }
  if (!subject) {
    logMailEvent({ ...logBase, provider: null, resultado: "error", error: "Sin asunto" });
    return res.status(400).json({ ok: false, error: "Sin asunto", provider: null, resultado: "error" });
  }

  const att = [];
  for (const a of attachments) {
    const resolved = await resolveAttachment(a);
    if (resolved) att.push(resolved);
  }

  return respondSimulacion(res, { ...logBase, attachmentCount: att.length }, att.length);
}
