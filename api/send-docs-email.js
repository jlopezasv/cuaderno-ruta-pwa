/**
 * Envío de documentación por email al cliente.
 * Sin RESEND_API_KEY: simulación (provider=simulacion, estado simulado).
 * Con RESEND_API_KEY: Resend real.
 */

import { getSupabaseServerEnv } from "./_lib/supabaseEnv.js";
import {
  guardDemoCannotUseProduction,
  guardDemoCannotUseProductionInString,
} from "./_lib/demoSafety.js";
import { isDemoApp } from "./_lib/appEnvironment.js";

const SIM_OK_MSG =
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
    message: SIM_OK_MSG,
    attachmentCount,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  if (isDemoApp()) {
    try {
      guardDemoCannotUseProduction(SB_URL, "send-docs-email:handler");
    } catch (e) {
      return res.status(503).json({ ok: false, error: e.message, code: "DEMO_SAFETY_BLOCKED" });
    }
  }

  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const defaultFrom = process.env.EMAIL_FROM || "Cuaderno de Ruta <expedientes@cuadernoderutapro.es>";

  const { from: fromBody, reply_to: replyToBody, to, cc, subject, html, text, attachments = [] } =
    req.body || {};
  const from = String(fromBody || "").trim() || defaultFrom;
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

  if (!apiKey) {
    return respondSimulacion(res, { ...logBase, attachmentCount: att.length }, att.length);
  }

  try {
    const payload = {
      from,
      to: recipients,
      subject: String(subject).slice(0, 998),
      html: html || `<pre>${escapeHtml(text || "")}</pre>`,
      attachments: att.length ? att : undefined,
    };
    if (ccList.length) payload.cc = ccList;
    if (replyToList.length) payload.reply_to = replyToList.length === 1 ? replyToList[0] : replyToList;

    logMailEvent({ ...logBase, provider: "resend", resultado: "pending" });

    const out = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await out.json().catch(() => ({}));
    if (!out.ok) {
      const errMsg = data?.message || data?.error || `Resend ${out.status}`;
      logMailEvent({
        ...logBase,
        provider: "resend",
        resultado: "error",
        error: errMsg,
        resend_status: out.status,
      });
      return res.status(502).json({
        ok: false,
        error: errMsg,
        code: "RESEND_ERROR",
        provider: "resend",
        resultado: "error",
      });
    }
    const messageId = data?.id || null;
    logMailEvent({
      ...logBase,
      provider: "resend",
      resultado: "enviado",
      provider_message_id: messageId,
    });
    return res.status(200).json({
      ok: true,
      simulated: false,
      provider: "resend",
      resultado: "enviado",
      provider_message_id: messageId,
      id: messageId,
    });
  } catch (e) {
    const errMsg = e?.message || String(e);
    logMailEvent({ ...logBase, provider: "resend", resultado: "error", error: errMsg });
    return res.status(500).json({
      ok: false,
      error: errMsg,
      code: "MAIL_EXCEPTION",
      provider: "resend",
      resultado: "error",
    });
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
