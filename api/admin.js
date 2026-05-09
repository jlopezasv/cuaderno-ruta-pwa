// api/admin.js — Vercel Serverless Function
// Gestiona emails transaccionales (Brevo)

const BREVO_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL = "axiskeelb2b@gmail.com";
const APP_NAME = "Cuaderno de Ruta";
const APP_URL = "https://tacografo-pro.vercel.app";

async function sendEmail(to, subject, html) {
  if (!BREVO_KEY) return { ok: false, error: "No BREVO_API_KEY" };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_KEY,
    },
    body: JSON.stringify({
      sender: { name: APP_NAME, email: "noreply@cuadernoderutapro.es" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  return { ok: res.ok, status: res.status };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
      code: "ADMIN_METHOD_NOT_ALLOWED",
    });
  }

  const { action, email, nombre, tipo } = req.body || {};
  if (!action) {
    return res.status(400).json({
      ok: false,
      error: "Missing action",
      code: "ADMIN_BAD_REQUEST",
    });
  }

  // ── Email bienvenida al usuario ──
  if (action === "bienvenida") {
    if (!email || !nombre || !tipo) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields for bienvenida",
        code: "ADMIN_BAD_REQUEST",
      });
    }

    const esEmpresa = tipo === "empresa";
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0F172A;color:#F1F5F9;padding:32px;border-radius:16px">
        <div style="text-align:center;margin-bottom:28px">
          <div style="font-size:28px;font-weight:900;color:#F59E0B">🚛 CUADERNO DE RUTA</div>
          <div style="font-size:14px;color:#64748B;margin-top:4px">La app de los camioneros</div>
        </div>
        <div style="font-size:20px;font-weight:700;margin-bottom:12px">¡Bienvenido, ${nombre}! 👋</div>
        <div style="font-size:15px;color:#CBD5E1;line-height:1.7;margin-bottom:24px">
          Tu cuenta está lista. Ya puedes registrar tu jornada, gestionar pausas y cumplir la normativa EU 561/2006 sin papel.
        </div>
        ${esEmpresa ? `
        <div style="background:#F59E0B20;border:1px solid #F59E0B;border-radius:10px;padding:16px;margin-bottom:24px">
          <div style="font-weight:700;color:#F59E0B;margin-bottom:6px">🏢 Cuenta de empresa</div>
          <div style="font-size:13px;color:#CBD5E1">
            Entra en tu Perfil para crear tu empresa y obtener el código para tus conductores.
          </div>
        </div>
        ` : ""}
        <div style="margin-bottom:24px">
          <div style="font-size:13px;font-weight:700;color:#64748B;margin-bottom:12px">¿QUÉ PUEDES HACER?</div>
          ${[
            ["⏱", "Registrar jornadas y pausas según EU 561/2006"],
            ["🗺", "Planificar rutas con pausas obligatorias incluidas"],
            ["🅿", "Ver 300+ parkings de camiones en el mapa"],
            ["🤖", "Consultar dudas al asistente IA de normativa"],
            ["👁", "Saber qué decir en una inspección policial"],
          ].map(([i, t]) => `
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
              <span style="font-size:18px">${i}</span>
              <span style="font-size:14px;color:#CBD5E1">${t}</span>
            </div>
          `).join("")}
        </div>
        <div style="text-align:center;margin-bottom:20px">
          <a href="${APP_URL}" style="background:#F59E0B;color:#0F172A;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:800;font-size:16px;display:inline-block">
            ABRIR LA APP
          </a>
        </div>
        <div style="font-size:12px;color:#475569;text-align:center;border-top:1px solid #1E293B;padding-top:16px">
          ${APP_URL} · Cualquier problema escríbenos a ${ADMIN_EMAIL}
        </div>
      </div>
    `;

    const userEmail = await sendEmail(email, `Bienvenido a ${APP_NAME} 🚛`, html);
    if (!userEmail.ok) {
      return res.status(500).json({
        ok: false,
        error: userEmail.error || "Failed to send bienvenida email",
        code: "ADMIN_EMAIL_FAILED",
      });
    }

    const adminEmail = await sendEmail(ADMIN_EMAIL, `Nuevo registro: ${nombre} (${tipo})`,
      `<p>Nuevo usuario registrado:</p><ul><li><b>Nombre:</b> ${nombre}</li><li><b>Email:</b> ${email}</li><li><b>Tipo:</b> ${tipo}</li></ul>`
    );
    if (!adminEmail.ok) {
      return res.status(500).json({
        ok: false,
        error: adminEmail.error || "Failed to notify admin",
        code: "ADMIN_EMAIL_FAILED",
      });
    }

    return res.json({ ok: true });
  }

  // ── Notificación nueva empresa (legacy) ──
  if (action === "notify_nueva_empresa") {
    if (!email || !nombre) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields for notify_nueva_empresa",
        code: "ADMIN_BAD_REQUEST",
      });
    }
    const r = await sendEmail(ADMIN_EMAIL, `Nueva empresa: ${nombre}`,
      `<p>Nueva empresa registrada:</p><ul><li><b>Nombre:</b> ${nombre}</li><li><b>Email:</b> ${email}</li></ul>`
    );
    if (!r.ok) {
      return res.status(500).json({
        ok: false,
        error: r.error || "Failed to notify admin",
        code: "ADMIN_EMAIL_FAILED",
      });
    }
    return res.json({ ok: true });
  }

  if (
    action === "delete_user" ||
    action === "delete_empresa" ||
    action === "create_user" ||
    action === "reset_password" ||
    action === "invite_conductor" ||
    action === "invite_conductor_solo"
  ) {
    return res.status(501).json({
      ok: false,
      error: `Action not implemented in PR-01: ${action}`,
      code: "NOT_IMPLEMENTED",
    });
  }

  return res.status(501).json({
    ok: false,
    error: `Unknown action: ${action}`,
    code: "NOT_IMPLEMENTED",
  });
}
