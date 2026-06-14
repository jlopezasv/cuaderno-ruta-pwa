// api/dcdt-verify.js — Verificación pública DCDT (solo lectura, QR inspección)
import { getSupabaseServiceRoleKey, getSupabaseServerEnv } from "./_lib/supabaseEnv.js";
import { formatDcdtVerifyPublicRow } from "../src/domain/dcdt/dcdtVerifyPayload.js";

const DCDT_TABLES = ["dcdt_servicio", "carta_porte_servicio"];
const ESTADOS_QR = new Set(["validado", "incluido_en_expediente"]);

async function fetchDcdtByToken(token) {
  const { url } = getSupabaseServerEnv();
  const enc = encodeURIComponent(token);
  for (const table of DCDT_TABLES) {
    const path = `${url}/rest/v1/${table}?datos->>qr_verificacion_token=eq.${enc}&select=id,estado,datos,validado_at&limit=1`;
    const r = await fetch(path, { headers: srHeaders() });
    if (!r.ok) continue;
    const rows = await r.json();
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  return null;
}

function srHeaders() {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function resolveVerifySnapshot(datos) {
  if (!datos || typeof datos !== "object") return null;
  if (datos.qr_verificacion_snapshot && typeof datos.qr_verificacion_snapshot === "object") {
    return datos.qr_verificacion_snapshot;
  }
  if (datos.validacion_snapshot && typeof datos.validacion_snapshot === "object") {
    return datos.validacion_snapshot;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=60");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = String(req.query?.token || "").trim();
  if (!token || token.length < 8 || token.length > 80) {
    return res.status(400).json({ ok: false, error: "Token no válido" });
  }

  try {
    const row = await fetchDcdtByToken(token);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Documento no encontrado" });
    }

    const estado = String(row.estado || "").toLowerCase();
    if (!ESTADOS_QR.has(estado)) {
      return res.status(403).json({ ok: false, error: "DCDT no validado para verificación" });
    }

    const datos = row.datos && typeof row.datos === "object" ? row.datos : {};
    const snapshot = resolveVerifySnapshot(datos);
    const publicRow = formatDcdtVerifyPublicRow(snapshot, { estado, validadoAt: row.validado_at });
    if (!publicRow?.sections) {
      return res.status(404).json({ ok: false, error: "Datos de verificación no disponibles" });
    }

    return res.status(200).json({ ok: true, dcdt: publicRow });
  } catch (e) {
    console.error("[dcdt-verify]", e?.message || e);
    return res.status(500).json({ ok: false, error: "Error de verificación" });
  }
}
