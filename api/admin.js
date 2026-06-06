// api/admin.js — Vercel Serverless Function
// Gestiona emails transaccionales (Brevo) y archivado lógico de perfiles (service_role).

import { getSupabaseServerEnv } from "./lib/supabaseEnv.js";
import { isDemoApp } from "./lib/appEnvironment.js";

const BREVO_KEY = process.env.BREVO_API_KEY;

function sbServer() {
  return getSupabaseServerEnv();
}

const DEFAULT_ADMIN_UIDS = "ca5dd314-2e37-4f08-86d7-09103cb8e510";
const ADMIN_PANEL_USER_IDS = (process.env.ADMIN_PANEL_USER_IDS || DEFAULT_ADMIN_UIDS)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function supabaseAuthUserId(accessToken) {
  const res = await fetch(`${sbServer().url}/auth/v1/user`, {
    headers: {
      apikey: sbServer().anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.id) return null;
  return d.id;
}

async function archiveProfileById(userId) {
  const res = await fetch(
    `${sbServer().url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: sbServer().serviceRoleKey,
        Authorization: `Bearer ${sbServer().serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ is_archived: true }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail: t };
  }
  return { ok: true };
}

const PURGE_TEST_COMPANY_CONFIRM =
  process.env.PURGE_TEST_COMPANY_CONFIRM || "PURGO_EMPRESA_PRUEBA";

const PRIMARY_PURGE_ADMIN_UID = (
  process.env.PRIMARY_PURGE_ADMIN_UID ||
  ADMIN_PANEL_USER_IDS[0] ||
  ""
).trim();

function isPurgeTestCompanyServerAllowed() {
  if (process.env.VERCEL_ENV === "production") return false;
  const v = String(process.env.ALLOW_PURGE_TEST_COMPANY || "").toLowerCase();
  return v === "1" || v === "true";
}

function srRestHeaders(json = true) {
  const h = {
    apikey: sbServer().serviceRoleKey,
    Authorization: `Bearer ${sbServer().serviceRoleKey}`,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function restSelect(pathWithQuery) {
  const r = await fetch(`${sbServer().url}/rest/v1/${pathWithQuery}`, {
    headers: {
      ...srRestHeaders(false),
      Accept: "application/json",
    },
  });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

async function restDelete(pathWithQuery) {
  const r = await fetch(`${sbServer().url}/rest/v1/${pathWithQuery}`, {
    method: "DELETE",
    headers: { ...srRestHeaders(true), Prefer: "return=minimal" },
  });
  return r.ok || r.status === 404;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Lista objetos recursivamente bajo el prefijo de un usuario (uid/…). */
async function storageListAll(bucket, userId) {
  const root = String(userId || "").replace(/\/$/, "");
  const out = [];
  const stack = [root];
  while (stack.length) {
    const prefix = stack.pop();
    const prefixSlash = prefix ? `${prefix}/` : "";
    const r = await fetch(
      `${sbServer().url}/storage/v1/object/list/${encodeURIComponent(bucket)}`,
      {
        method: "POST",
        headers: srRestHeaders(true),
        body: JSON.stringify({
          prefix: prefixSlash,
          limit: 1000,
          offset: 0,
        }),
      },
    );
    if (!r.ok) break;
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows)) break;
    for (const row of rows) {
      const name = row?.name;
      if (!name) continue;
      const full = prefix ? `${prefix}/${name}` : name;
      const size = row?.metadata?.size;
      if (row.id || (size != null && Number(size) >= 0)) {
        out.push({ bucket, path: full });
      } else {
        stack.push(full);
      }
    }
  }
  return out;
}

async function storageRemoveObjects(items) {
  for (const { bucket, path } of items) {
    const enc = path
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    await fetch(
      `${sbServer().url}/storage/v1/object/${encodeURIComponent(bucket)}/${enc}`,
      { method: "DELETE", headers: srRestHeaders(false) },
    ).catch(() => {});
  }
}

async function purgeStorageForUserIds(userIds) {
  const buckets = ["user-photos", "cmr"];
  for (const uid of userIds) {
    for (const bucket of buckets) {
      const listed = await storageListAll(bucket, uid);
      await storageRemoveObjects(
        listed.map((x) => ({ bucket: x.bucket, path: x.path })),
      );
    }
  }
}

async function authAdminDeleteUser(userId) {
  const r = await fetch(
    `${sbServer().url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: srRestHeaders(false),
    },
  );
  return r.ok || r.status === 404;
}

const DEMO_OFFICE_USER_PASSWORD = "DemoCuaderno2026!";

async function authAdminCreateUser({ email, password, nombre }) {
  const r = await fetch(`${sbServer().url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...srRestHeaders(true), Prefer: "return=representation" },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: nombre || "" },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, status: r.status, error: data?.msg || data?.message || "Auth create failed" };
  }
  return { ok: true, user: data };
}

async function restUpsert(pathWithQuery, body) {
  const r = await fetch(`${sbServer().url}/rest/v1/${pathWithQuery}`, {
    method: "POST",
    headers: {
      ...srRestHeaders(true),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data, detail: data };
}

async function callerCanManageEmpresaUsuarios(callerUid, empresaId) {
  const emps = await restSelect(
    `empresas?id=eq.${encodeURIComponent(empresaId)}&select=id,owner_id`,
  );
  if (emps[0]?.owner_id === callerUid) return true;
  const rows = await restSelect(
    `empresa_usuarios?empresa_id=eq.${encodeURIComponent(empresaId)}&user_id=eq.${encodeURIComponent(callerUid)}&activo=eq.true&select=rol`,
  );
  return rows[0]?.rol === "jefe_flota";
}

/**
 * Purga total datos ligados a una empresa (solo dev/staging + flags).
 * Orden pensado para FKs habituales en el proyecto.
 */
async function purgeTestCompanyData(empresaId, { killAuth = true } = {}) {
  const empRows = await restSelect(
    `empresas?id=eq.${encodeURIComponent(empresaId)}&select=id,owner_id,nombre`,
  );
  if (!empRows.length) return { ok: false, error: "Empresa no encontrada" };

  const ownerId = empRows[0].owner_id;
  const ceRows = await restSelect(
    `conductor_empresa?empresa_id=eq.${encodeURIComponent(empresaId)}&select=user_id,activo`,
  );
  const driverUids = [
    ...new Set(
      (ceRows || [])
        .map((r) => r.user_id)
        .filter((id) => id && id !== ownerId),
    ),
  ];

  let servicioIds = [];
  const byEmpresa = await restSelect(
    `servicios?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id`,
  );
  servicioIds.push(...(byEmpresa || []).map((s) => s.id).filter(Boolean));
  if (driverUids.length) {
    for (const part of chunk(driverUids, 40)) {
      const inList = part.join(",");
      const byCond = await restSelect(
        `servicios?conductor_id=in.(${inList})&select=id`,
      );
      servicioIds.push(...(byCond || []).map((s) => s.id).filter(Boolean));
    }
  }
  servicioIds = [...new Set(servicioIds)];

  let stopIds = [];
  if (servicioIds.length) {
    for (const part of chunk(servicioIds, 40)) {
      const inList = part.join(",");
      const stops = await restSelect(
        `stops?servicio_id=in.(${inList})&select=id`,
      );
      stopIds.push(...(stops || []).map((s) => s.id).filter(Boolean));
    }
  }
  stopIds = [...new Set(stopIds)];

  if (stopIds.length) {
    for (const part of chunk(stopIds, 80)) {
      await restDelete(`evidencias?stop_id=in.(${part.join(",")})`);
    }
  }

  if (servicioIds.length) {
    for (const part of chunk(servicioIds, 40)) {
      const inList = part.join(",");
      await restDelete(`asignaciones?servicio_id=in.(${inList})`);
      await restDelete(`servicio_documentos_extra?servicio_id=in.(${inList})`);
      await restDelete(`documentacion_envios?servicio_id=in.(${inList})`);
      await restDelete(`stops?servicio_id=in.(${inList})`);
      await restDelete(`servicios?id=in.(${inList})`);
    }
  }

  const trackingUids = [...new Set([...driverUids, ownerId].filter(Boolean))];
  if (trackingUids.length) {
    for (const part of chunk(trackingUids, 40)) {
      await restDelete(`ubicaciones?user_id=in.(${part.join(",")})`);
    }
  }

  await restDelete(
    `conductor_empresa?empresa_id=eq.${encodeURIComponent(empresaId)}`,
  );

  if (driverUids.length) {
    await purgeStorageForUserIds(driverUids);
    for (const part of chunk(driverUids, 40)) {
      const inList = part.join(",");
      await restDelete(`push_tokens?user_id=in.(${inList})`);
      await restDelete(`subscriptions?user_id=in.(${inList})`);
      await restDelete(`entries?user_id=in.(${inList})`);
      await restDelete(`documentos?user_id=in.(${inList})`);
    }
    if (killAuth) {
      for (const uid of driverUids) {
        await authAdminDeleteUser(uid);
      }
    }
  }

  await restDelete(`empresas?id=eq.${encodeURIComponent(empresaId)}`);

  return {
    ok: true,
    deleted: {
      servicios: servicioIds.length,
      stops: stopIds.length,
      conductor_links: ceRows.length,
      driver_accounts: driverUids.length,
    },
  };
}

const ADMIN_EMAIL = "axiskeelb2b@gmail.com";
const APP_NAME = "Cuaderno de Ruta";
const APP_URL =
  process.env.APP_URL || "https://cuaderno-demo-ab.vercel.app";

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
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
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

  // ── Archivar usuario/conductor (UPDATE is_archived, sin DELETE) ──
  if (action === "archive_user" || action === "delete_user") {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const { admin_uid, user_id } = req.body || {};
    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Falta Authorization: Bearer (sesión del administrador)",
        code: "ADMIN_UNAUTHORIZED",
      });
    }
    if (!sbServer().serviceRoleKey) {
      return res.status(503).json({
        ok: false,
        error:
          "Servidor sin sbServer().serviceRoleKey: no se puede archivar desde API",
        code: "ADMIN_MISCONFIGURED",
      });
    }
    if (!admin_uid || !user_id || !UUID_RE.test(user_id) || !UUID_RE.test(admin_uid)) {
      return res.status(400).json({
        ok: false,
        error: "admin_uid y user_id UUID obligatorios",
        code: "ADMIN_BAD_REQUEST",
      });
    }
    const jwtUid = await supabaseAuthUserId(token);
    if (!jwtUid || jwtUid !== admin_uid) {
      return res.status(403).json({
        ok: false,
        error: "Token no coincide con admin_uid",
        code: "ADMIN_FORBIDDEN",
      });
    }
    if (!ADMIN_PANEL_USER_IDS.includes(admin_uid)) {
      return res.status(403).json({
        ok: false,
        error: "Esta cuenta no puede archivar usuarios",
        code: "ADMIN_FORBIDDEN",
      });
    }
    if (user_id === admin_uid) {
      return res.status(400).json({
        ok: false,
        error: "No puedes archivar tu propia cuenta",
        code: "ADMIN_BAD_REQUEST",
      });
    }
    const ar = await archiveProfileById(user_id);
    if (!ar.ok) {
      return res.status(502).json({
        ok: false,
        error: "No se pudo archivar el perfil en Supabase",
        code: "ADMIN_SUPABASE_ERROR",
        detail: ar.detail,
      });
    }
    return res.json({ ok: true, archived: true });
  }

  // ── Purga total empresa de PRUEBA (solo dev/staging; no sustituye archivado) ──
  if (action === "purge_test_company") {
    if (!isPurgeTestCompanyServerAllowed()) {
      return res.status(403).json({
        ok: false,
        error:
          "Purga desactivada: en producción Vercel no está permitida, o falta ALLOW_PURGE_TEST_COMPANY=1",
        code: "PURGE_ENV_FORBIDDEN",
      });
    }
    if (!PRIMARY_PURGE_ADMIN_UID) {
      return res.status(503).json({
        ok: false,
        error: "Falta PRIMARY_PURGE_ADMIN_UID o ADMIN_PANEL_USER_IDS",
        code: "ADMIN_MISCONFIGURED",
      });
    }
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const {
      admin_uid,
      empresa_id,
      confirm_text,
      purge_conductor_accounts,
    } = req.body || {};
    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Falta Authorization: Bearer",
        code: "ADMIN_UNAUTHORIZED",
      });
    }
    if (!sbServer().serviceRoleKey) {
      return res.status(503).json({
        ok: false,
        error: "Servidor sin sbServer().serviceRoleKey",
        code: "ADMIN_MISCONFIGURED",
      });
    }
    if (
      !admin_uid ||
      !empresa_id ||
      !UUID_RE.test(empresa_id) ||
      !UUID_RE.test(admin_uid)
    ) {
      return res.status(400).json({
        ok: false,
        error: "admin_uid y empresa_id UUID obligatorios",
        code: "ADMIN_BAD_REQUEST",
      });
    }
    const jwtUid = await supabaseAuthUserId(token);
    if (!jwtUid || jwtUid !== admin_uid) {
      return res.status(403).json({
        ok: false,
        error: "Token no coincide con admin_uid",
        code: "ADMIN_FORBIDDEN",
      });
    }
    if (!ADMIN_PANEL_USER_IDS.includes(admin_uid)) {
      return res.status(403).json({
        ok: false,
        error: "Cuenta no autorizada para el panel",
        code: "ADMIN_FORBIDDEN",
      });
    }
    if (admin_uid !== PRIMARY_PURGE_ADMIN_UID) {
      return res.status(403).json({
        ok: false,
        error: "Solo el admin principal puede ejecutar purge_test_company",
        code: "PURGE_PRIMARY_ADMIN_ONLY",
      });
    }
    if (String(confirm_text || "").trim() !== PURGE_TEST_COMPANY_CONFIRM) {
      return res.status(400).json({
        ok: false,
        error: `Confirmación incorrecta. Escribe exactamente: ${PURGE_TEST_COMPANY_CONFIRM}`,
        code: "PURGE_CONFIRM_BAD",
      });
    }
    const killAuth = purge_conductor_accounts !== false;
    const pr = await purgeTestCompanyData(empresa_id, { killAuth });
    if (!pr.ok) {
      return res.status(400).json({
        ok: false,
        error: pr.error || "Purga fallida",
        code: "PURGE_FAILED",
      });
    }
    return res.json({ ok: true, ...pr });
  }

  // ── DEMO: crear usuario oficina (sin email) ──
  if (action === "create_office_user_demo") {
    if (!isDemoApp()) {
      return res.status(403).json({
        ok: false,
        error: "Solo disponible en entorno DEMO",
        code: "DEMO_ONLY",
      });
    }
    const {
      caller_uid,
      empresa_id,
      nombre: nombreOficina,
      email: emailOficina,
      rol = "trafico",
    } = req.body || {};
    const rolNorm = ["jefe_flota", "trafico", "administrativo"].includes(rol)
      ? rol
      : "trafico";
    if (
      !caller_uid ||
      !empresa_id ||
      !nombreOficina?.trim() ||
      !emailOficina?.trim() ||
      !UUID_RE.test(caller_uid) ||
      !UUID_RE.test(empresa_id)
    ) {
      return res.status(400).json({
        ok: false,
        error: "caller_uid, empresa_id, nombre y email obligatorios",
        code: "ADMIN_BAD_REQUEST",
      });
    }
    if (!sbServer().serviceRoleKey) {
      return res.status(503).json({
        ok: false,
        error: "Servidor sin service_role",
        code: "ADMIN_MISCONFIGURED",
      });
    }
    const allowed = await callerCanManageEmpresaUsuarios(caller_uid, empresa_id);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado para gestionar usuarios de esta empresa",
        code: "OFFICE_USER_FORBIDDEN",
      });
    }
    const email = String(emailOficina).trim().toLowerCase();
    const nombre = String(nombreOficina).trim();
    const created = await authAdminCreateUser({
      email,
      password: DEMO_OFFICE_USER_PASSWORD,
      nombre,
    });
    if (!created.ok) {
      return res.status(created.status || 500).json({
        ok: false,
        error: created.error || "No se pudo crear el usuario",
        code: "AUTH_CREATE_FAILED",
      });
    }
    const userId = created.user?.id;
    if (!userId) {
      return res.status(500).json({
        ok: false,
        error: "Auth sin user id",
        code: "AUTH_CREATE_FAILED",
      });
    }
    const prof = await restUpsert("profiles", {
      id: userId,
      nombre,
      tipo_cuenta: "conductor",
      can_drive: false,
      updated_at: new Date().toISOString(),
    });
    if (!prof.ok) {
      await authAdminDeleteUser(userId);
      return res.status(500).json({
        ok: false,
        error: "No se pudo crear el perfil",
        code: "PROFILE_UPSERT_FAILED",
      });
    }
    const link = await restUpsert("empresa_usuarios", {
      empresa_id,
      user_id: userId,
      nombre,
      email,
      rol: rolNorm,
      puede_ver_todos: false,
      activo: true,
    });
    if (!link.ok) {
      await authAdminDeleteUser(userId);
      return res.status(500).json({
        ok: false,
        error: "No se pudo vincular usuario a la empresa",
        code: "OFFICE_LINK_FAILED",
      });
    }
    const row = Array.isArray(link.data) ? link.data[0] : link.data;
    return res.json({
      ok: true,
      user_id: userId,
      email,
      password: DEMO_OFFICE_USER_PASSWORD,
      empresa_usuario: row,
    });
  }

  if (
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
