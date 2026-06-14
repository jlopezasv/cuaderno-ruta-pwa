import { sbFetch } from "../../data/supabaseClient.js";
import { PARTE_TIPO } from "./dcdtConstants.js";

const COLS =
  "id,empresa_id,tipo,nombre,nif,domicilio_fiscal,direccion_operativa,ciudad,codigo_postal,pais,contacto_nombre,contacto_email,contacto_telefono,activo,updated_at";

function rowToParte(row) {
  if (!row) return null;
  return {
    id: row.id,
    empresaId: row.empresa_id,
    tipo: row.tipo,
    nombre: row.nombre || "",
    nif: row.nif || "",
    domicilioFiscal: row.domicilio_fiscal || "",
    direccionOperativa: row.direccion_operativa || "",
    ciudad: row.ciudad || "",
    codigoPostal: row.codigo_postal || "",
    pais: row.pais || "ES",
    contactoNombre: row.contacto_nombre || "",
    contactoEmail: row.contacto_email || "",
    contactoTelefono: row.contacto_telefono || "",
    activo: row.activo !== false,
    updatedAt: row.updated_at,
  };
}

function parteToDb(p) {
  return {
    empresa_id: p.empresaId,
    tipo: p.tipo,
    nombre: String(p.nombre || "").trim(),
    nif: p.nif ? String(p.nif).trim() : null,
    domicilio_fiscal: p.domicilioFiscal ? String(p.domicilioFiscal).trim() : null,
    direccion_operativa: p.direccionOperativa ? String(p.direccionOperativa).trim() : null,
    ciudad: p.ciudad ? String(p.ciudad).trim() : null,
    codigo_postal: p.codigoPostal ? String(p.codigoPostal).trim() : null,
    pais: p.pais ? String(p.pais).trim() : "ES",
    contacto_nombre: p.contactoNombre ? String(p.contactoNombre).trim() : null,
    contacto_email: p.contactoEmail ? String(p.contactoEmail).trim() : null,
    contacto_telefono: p.contactoTelefono ? String(p.contactoTelefono).trim() : null,
    activo: p.activo !== false,
    updated_at: new Date().toISOString(),
  };
}

export function suggestParteTipoForStop(stopTipo) {
  const t = String(stopTipo || "").toLowerCase();
  if (t === "carga") return PARTE_TIPO.CARGADOR;
  if (t === "descarga") return PARTE_TIPO.DESTINATARIO;
  return PARTE_TIPO.OPERADOR;
}

export async function fetchPartesTransporte(empresaId, { tipo = null, activoOnly = true } = {}) {
  if (!empresaId) return [];
  let q = `/rest/v1/master_partes_transporte?empresa_id=eq.${empresaId}&order=nombre.asc&select=${COLS}`;
  if (activoOnly) q += "&activo=eq.true";
  if (tipo) q += `&tipo=eq.${tipo}`;
  const r = await sbFetch(q);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    if (/master_partes_transporte|42P01|PGRST205/i.test(body)) return [];
    throw new Error("No se pudo cargar el catálogo de partes");
  }
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map(rowToParte);
}

export async function createParteTransporteRapido({ empresaId, tipo, nombre, direccion, nif = null, ciudad = null }) {
  const body = parteToDb({
    empresaId,
    tipo: tipo || PARTE_TIPO.OPERADOR,
    nombre,
    nif,
    direccionOperativa: direccion,
    ciudad,
    activo: true,
  });
  const r = await sbFetch("/rest/v1/master_partes_transporte", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("No se pudo crear la parte");
  const rows = await r.json();
  return rowToParte(Array.isArray(rows) ? rows[0] : null);
}

export function parteToDisplayLine(parte) {
  if (!parte) return "—";
  const loc = [parte.ciudad, parte.codigoPostal].filter(Boolean).join(" ");
  return loc ? `${parte.nombre} · ${loc}` : parte.nombre;
}

export function resolveParteFields(parte, overrides = {}) {
  if (!parte && !overrides?.nombre) return null;
  return {
    id: parte?.id || null,
    nombre: overrides.nombre ?? parte?.nombre ?? "",
    nif: overrides.nif ?? parte?.nif ?? "",
    domicilio:
      overrides.domicilio ??
      overrides.domicilio_fiscal ??
      parte?.domicilioFiscal ??
      parte?.direccionOperativa ??
      "",
    direccion: overrides.direccion ?? parte?.direccionOperativa ?? "",
    ciudad: overrides.ciudad ?? parte?.ciudad ?? "",
    codigoPostal: overrides.codigo_postal ?? parte?.codigoPostal ?? "",
    pais: overrides.pais ?? parte?.pais ?? "",
  };
}
