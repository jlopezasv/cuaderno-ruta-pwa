import { sbFetch } from "../../data/supabaseClient.js";

function pickStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * Vehículo del conductor para DCDT: conductor_empresa (empresa) + profiles (fallback).
 */
export async function fetchConductorVehiculoForDcdt(userId, empresaId = null) {
  if (!userId) return null;

  let ce = null;
  const ceBase = empresaId
    ? `user_id=eq.${userId}&empresa_id=eq.${empresaId}`
    : `user_id=eq.${userId}`;

  for (const select of [
    "id,user_id,nombre,matricula,remolque",
    "id,user_id,nombre,matricula",
  ]) {
    const cr = await sbFetch(`/rest/v1/conductor_empresa?${ceBase}&select=${select}&limit=1`);
    if (!cr.ok) continue;
    const rows = await cr.json().catch(() => []);
    ce = Array.isArray(rows) ? rows[0] : null;
    if (ce) break;
  }

  let profile = null;
  const pr = await sbFetch(
    `/rest/v1/profiles?id=eq.${userId}&select=id,nombre,matricula,remolque&limit=1`,
  );
  if (pr.ok) {
    const rows = await pr.json().catch(() => []);
    profile = Array.isArray(rows) ? rows[0] : null;
  }

  return {
    user_id: userId,
    conductor_empresa_id: ce?.id || null,
    nombre: pickStr(ce?.nombre, profile?.nombre) || null,
    matricula: pickStr(ce?.matricula, profile?.matricula) || null,
    remolque: pickStr(ce?.remolque, profile?.remolque) || null,
  };
}

/** Guarda matrícula tractora y remolque en conductor_empresa (flota empresa). */
export async function guardarConductorVehiculoEmpresa(conductorEmpresaId, { matricula, remolque }) {
  if (!conductorEmpresaId) throw new Error("Conductor no válido");
  const body = {
    matricula: String(matricula ?? "").trim() || null,
    remolque: String(remolque ?? "").trim() || null,
  };
  const r = await sbFetch(`/rest/v1/conductor_empresa?id=eq.${conductorEmpresaId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const text = await r.text().catch(() => "");
  if (!r.ok) throw new Error(text || "No se pudo guardar el vehículo del conductor");
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Sincroniza matrícula/remolque del perfil del conductor hacia conductor_empresa
 * (oficina lee flota sin acceso a profiles).
 */
export async function syncConductorVehiculoProfileToEmpresaFlota(userId, { matricula, remolque }) {
  if (!userId) return { updated: 0 };

  const r = await sbFetch(
    `/rest/v1/conductor_empresa?user_id=eq.${userId}&activo=eq.true&select=id`,
  );
  if (!r.ok) return { updated: 0 };

  const rows = await r.json().catch(() => []);
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { updated: 0 };

  const payload = {
    matricula: String(matricula ?? "").trim() || null,
    remolque: String(remolque ?? "").trim() || null,
  };

  let updated = 0;
  for (const row of list) {
    if (!row?.id) continue;
    try {
      await guardarConductorVehiculoEmpresa(row.id, payload);
      updated += 1;
    } catch {
      /* fila ajena o RLS — continuar con el resto */
    }
  }
  return { updated };
}
