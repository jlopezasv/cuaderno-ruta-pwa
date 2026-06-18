import { sbFetch } from "../../data/supabaseClient.js";
import { parseSupabaseErrorBody } from "../documents/extraDocumentUploadLog.js";
import { PARTE_TIPO } from "./dcdtConstants.js";

const LOG_PREFIX = "[DCDT parte]";

export class ParteTransporteCreateError extends Error {
  constructor(message, { status, supabase, request } = {}) {
    super(message);
    this.name = "ParteTransporteCreateError";
    this.status = status ?? null;
    this.supabase = supabase ?? null;
    this.request = request ?? null;
  }
}

async function readSupabaseHttpError(response) {
  const raw = await response.text().catch(() => "");
  return { ...parseSupabaseErrorBody(raw), status: response.status, raw };
}

function formatParteInsertTechnicalError({ status, supabase, request }) {
  const parts = [
    `HTTP ${status}`,
    supabase?.code ? `code=${supabase.code}` : null,
    supabase?.message || null,
    supabase?.details ? `details=${supabase.details}` : null,
    supabase?.hint ? `hint=${supabase.hint}` : null,
  ].filter(Boolean);

  const rlsHit =
    status === 403 ||
    supabase?.code === "42501" ||
    /row-level security|permission denied/i.test(String(supabase?.message || ""));
  if (rlsHit) {
    parts.push(
      "RLS mpt_ins: requiere user_can_manage_dcdt_trafico (owner, jefe_flota o trafico activo en empresa_usuarios)",
    );
  }

  if (request?.empresa_id) {
    parts.push(`empresa_id=${request.empresa_id}`);
  }
  if (request?.tipo) {
    parts.push(`tipo=${request.tipo}`);
  }

  return parts.join(" · ");
}

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
  return createParteTransporte({
    empresaId,
    tipo,
    nombre,
    nif,
    direccionOperativa: direccion,
    ciudad,
  });
}

export async function createParteTransporte({
  empresaId,
  tipo,
  nombre,
  nif = null,
  domicilioFiscal = null,
  direccionOperativa = null,
  ciudad = null,
  codigoPostal = null,
  pais = null,
  contactoNombre = null,
  contactoEmail = null,
  contactoTelefono = null,
}) {
  if (!empresaId) {
    throw new ParteTransporteCreateError("empresa_id vacío — no se puede insertar en master_partes_transporte", {
      status: 0,
      request: { empresa_id: null, tipo, nombre },
    });
  }

  const body = parteToDb({
    empresaId,
    tipo: tipo || PARTE_TIPO.OPERADOR,
    nombre,
    nif,
    domicilioFiscal,
    direccionOperativa,
    ciudad,
    codigoPostal,
    pais,
    contactoNombre,
    contactoEmail,
    contactoTelefono,
    activo: true,
  });

  return postParteTransporte(body);
}

export async function updateParteTransporte(id, patch) {
  if (!id) throw new ParteTransporteCreateError("id de parte vacío", { status: 0 });
  const body = parteToDb({
    empresaId: patch.empresaId,
    tipo: patch.tipo,
    nombre: patch.nombre,
    nif: patch.nif,
    domicilioFiscal: patch.domicilioFiscal,
    direccionOperativa: patch.direccionOperativa,
    ciudad: patch.ciudad,
    codigoPostal: patch.codigoPostal,
    pais: patch.pais,
    contactoNombre: patch.contactoNombre,
    contactoEmail: patch.contactoEmail,
    contactoTelefono: patch.contactoTelefono,
    activo: patch.activo !== false,
  });
  delete body.empresa_id;

  const r = await sbFetch(`/rest/v1/master_partes_transporte?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const supabase = await readSupabaseHttpError(r);
    const technical = formatParteInsertTechnicalError({ status: r.status, supabase, request: { id, ...body } });
    console.error(`${LOG_PREFIX} UPDATE master_partes_transporte falló`, { id, body, supabase });
    throw new ParteTransporteCreateError(technical, { status: r.status, supabase, request: body });
  }

  const rows = await r.json();
  return rowToParte(Array.isArray(rows) ? rows[0] : null);
}

async function postParteTransporte(body) {
  const r = await sbFetch("/rest/v1/master_partes_transporte", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const supabase = await readSupabaseHttpError(r);
    const technical = formatParteInsertTechnicalError({ status: r.status, supabase, request: body });
    console.error(`${LOG_PREFIX} INSERT master_partes_transporte falló`, {
      status: r.status,
      request: {
        empresa_id: body.empresa_id,
        tipo: body.tipo,
        nombre: body.nombre,
        direccion_operativa: body.direccion_operativa,
        nif: body.nif,
        ciudad: body.ciudad,
      },
      supabase,
    });
    throw new ParteTransporteCreateError(technical, { status: r.status, supabase, request: body });
  }

  const rows = await r.json();
  return rowToParte(Array.isArray(rows) ? rows[0] : null);
}

export function parteToDisplayLine(parte) {
  if (!parte) return "—";
  const loc = [parte.ciudad, parte.codigoPostal].filter(Boolean).join(" ");
  return loc ? `${parte.nombre} · ${loc}` : parte.nombre;
}

function pickParteField(overrideVal, masterVal) {
  if (overrideVal != null && String(overrideVal).trim() !== "") return String(overrideVal).trim();
  if (masterVal != null && String(masterVal).trim() !== "") return String(masterVal).trim();
  return "";
}

export function resolveParteFields(parte, overrides = {}) {
  const nombre = pickParteField(overrides?.nombre, parte?.nombre);
  if (!parte && !nombre) return null;
  const domicilio = pickParteField(
    overrides?.domicilio ?? overrides?.domicilio_fiscal,
    parte?.domicilioFiscal ?? parte?.direccionOperativa,
  );
  return {
    id: parte?.id || null,
    nombre,
    nif: pickParteField(overrides?.nif, parte?.nif),
    domicilio,
    direccion: pickParteField(overrides?.direccion, parte?.direccionOperativa),
    ciudad: pickParteField(overrides?.ciudad, parte?.ciudad),
    codigoPostal: pickParteField(overrides?.codigo_postal, parte?.codigoPostal),
    pais: pickParteField(overrides?.pais, parte?.pais),
  };
}
