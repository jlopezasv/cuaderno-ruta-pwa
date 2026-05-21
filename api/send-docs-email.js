/**
 * Envío de documentación por email (Resend HTTP API).
 * Variables: RESEND_API_KEY, EMAIL_FROM (ej. Cuaderno <onboarding@resend.dev>)
 * SUPABASE_URL vía getSupabaseServerEnv (guard demo + sin fallback a prod).
 */
import { getSupabaseServerEnv } from "./lib/supabaseEnv.js";
import {
  guardDemoCannotUseProduction,
  guardDemoCannotUseProductionInString,
} from "./lib/demoSafety.js";
import { isDemoApp } from "./lib/appEnvironment.js";

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    guardDemoCannotUseProduction(SB_URL, "send-docs-email:handler");
  } catch (e) {
    return res.status(503).json({ ok: false, error: e.message, code: "DEMO_SAFETY_BLOCKED" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Cuaderno <onboarding@resend.dev>";

  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: "Email no configurado (RESEND_API_KEY)",
      code: "MAIL_NOT_CONFIGURED",
    });
  }

  const { to, subject, html, text, attachments = [] } = req.body || {};
  const recipients = String(to || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length) {
    return res.status(400).json({ ok: false, error: "Sin destinatarios" });
  }
  if (!subject) {
    return res.status(400).json({ ok: false, error: "Sin asunto" });
  }

  const att = [];
  for (const a of attachments) {
    if (!a?.url || !a?.filename) continue;
    if (!isAllowedAttachmentFetchUrl(a.url)) continue;
    try {
      const r = await fetch(a.url, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      att.push({
        filename: String(a.filename).slice(0, 180),
        content: buf.toString("base64"),
      });
    } catch (_) {
      /* skip attachment */
    }
  }

  try {
    const payload = {
      from,
      to: recipients,
      subject: String(subject).slice(0, 998),
      html: html || `<pre>${escapeHtml(text || "")}</pre>`,
      attachments: att.length ? att : undefined,
    };
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
      return res.status(502).json({
        ok: false,
        error: data?.message || data?.error || `Resend ${out.status}`,
        code: "RESEND_ERROR",
      });
    }
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e), code: "MAIL_EXCEPTION" });
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
