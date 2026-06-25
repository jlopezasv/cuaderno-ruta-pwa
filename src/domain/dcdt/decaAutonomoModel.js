import { getUserId, sbFetch } from "../../data/supabaseClient.js";
import { mergeAutonomoDecaDatos, autonomoDecaDatosFromProfile } from "../../features/dcdt/decaAutonomoFormDefaults.js";
import { DECA_AUTONOMO_ESTADO, DECA_AUTONOMO_TABLE, DECA_PORTES_OPTIONS } from "./decaAutonomoConstants.js";

const COLS = "id,user_id,estado,datos,deca_public_id,pdf_generado_at,created_at,updated_at";

function rowToDeca(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    estado: row.estado || DECA_AUTONOMO_ESTADO.BORRADOR,
    datos: mergeAutonomoDecaDatos(row.datos),
    decaPublicId: row.deca_public_id,
    pdfGeneradoAt: row.pdf_generado_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function placeLine(place) {
  const parts = [
    String(place?.lugar || "").trim(),
    String(place?.direccion || "").trim(),
    place?.codigo_postal ? `CP ${String(place.codigo_postal).trim()}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

function parteBlock(parte) {
  const nombre = String(parte?.nombre || "").trim();
  if (!nombre) return { nombre: null, nif: null, domicilio: null };
  return {
    nombre,
    nif: String(parte?.nif || "").trim() || null,
    domicilio: null,
  };
}

function portesLabel(id) {
  return DECA_PORTES_OPTIONS.find((o) => o.id === id)?.label || id || "—";
}

export function autonomoDecaListSummary(deca) {
  const d = deca?.datos || {};
  return {
    fecha: d.fecha || "—",
    origen: String(d.origen?.lugar || "").trim() || "—",
    destino: String(d.destino?.lugar || "").trim() || "—",
    matricula: String(d.vehiculo?.matricula || "").trim() || "—",
    estado: deca?.estado || DECA_AUTONOMO_ESTADO.BORRADOR,
  };
}

export function resolveAutonomoDecaDocument(deca) {
  const d = deca?.datos || mergeAutonomoDecaDatos(null);
  const shortId = String(deca?.decaPublicId || deca?.id || "").slice(0, 8).toUpperCase();
  const obsParts = [];
  if (d.conductor?.nombre) {
    const cond = [d.conductor.nombre, d.conductor.dni ? `DNI ${d.conductor.dni}` : "", d.conductor.telefono]
      .filter(Boolean)
      .join(" · ");
    obsParts.push(`Conductor: ${cond}`);
  }
  if (d.observaciones) obsParts.push(String(d.observaciones).trim());
  if (d.mercancia?.portes) obsParts.push(`Portes: ${portesLabel(d.mercancia.portes)}`);
  obsParts.push(`ID documento: ${deca?.decaPublicId || deca?.id || "—"}`);
  obsParts.push(`Generado: ${new Date().toLocaleString("es-ES")}`);

  return {
    referencia: shortId ? `DeCA-${shortId}` : "DeCA",
    cargador: parteBlock(d.partes?.cargador),
    destinatario: parteBlock(d.partes?.destinatario),
    transportista: parteBlock(d.partes?.transportista),
    origen: placeLine(d.origen),
    destino: placeLine(d.destino),
    mercancia: {
      descripcion: String(d.mercancia?.descripcion || "").trim() || null,
      peso_kg: d.mercancia?.peso_kg ?? null,
      bultos: d.mercancia?.bultos ?? null,
      palets: d.mercancia?.palets ?? null,
    },
    vehiculo: {
      matricula: String(d.vehiculo?.matricula || "").trim() || null,
      remolque: String(d.vehiculo?.remolque || "").trim() || null,
    },
    fecha_transporte: d.fecha || null,
    observaciones: obsParts.filter(Boolean).join("\n"),
    conductor_nombre: String(d.conductor?.nombre || "").trim() || null,
    conductor_dni: String(d.conductor?.dni || "").trim() || null,
  };
}

export function canEditAutonomoDeca(deca) {
  const st = String(deca?.estado || "").toLowerCase();
  return st === DECA_AUTONOMO_ESTADO.BORRADOR || st === DECA_AUTONOMO_ESTADO.GENERADO;
}

export function canDeleteAutonomoDeca(deca) {
  return String(deca?.estado || "").toLowerCase() === DECA_AUTONOMO_ESTADO.BORRADOR;
}

export async function fetchAutonomoDecasForUser(userId = null) {
  const uid = userId || getUserId();
  if (!uid) return [];
  const r = await sbFetch(
    `/rest/v1/${DECA_AUTONOMO_TABLE}?user_id=eq.${uid}&select=${COLS}&order=updated_at.desc&limit=100`,
  );
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return (Array.isArray(rows) ? rows : []).map(rowToDeca).filter(Boolean);
}

export async function fetchAutonomoDecaById(id) {
  if (!id) return null;
  const r = await sbFetch(`/rest/v1/${DECA_AUTONOMO_TABLE}?id=eq.${id}&select=${COLS}&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rowToDeca(Array.isArray(rows) ? rows[0] : null);
}

export async function createAutonomoDeca({ datos, userId = null, profile = null } = {}) {
  const uid = userId || getUserId();
  if (!uid) throw new Error("Sesión no válida");
  const baseDatos = profile
    ? mergeAutonomoDecaDatos(autonomoDecaDatosFromProfile(profile))
    : mergeAutonomoDecaDatos(null);
  const merged = mergeAutonomoDecaDatos({ ...baseDatos, ...mergeAutonomoDecaDatos(datos) });
  const r = await sbFetch(`/rest/v1/${DECA_AUTONOMO_TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: uid,
      estado: DECA_AUTONOMO_ESTADO.BORRADOR,
      datos: merged,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(body || `No se pudo crear DeCA (${r.status})`);
  }
  const rows = await r.json().catch(() => []);
  return rowToDeca(Array.isArray(rows) ? rows[0] : rows);
}

export async function saveAutonomoDecaDatos(id, datos, { estado } = {}) {
  if (!id) throw new Error("DeCA no encontrado");
  const patch = {
    datos: mergeAutonomoDecaDatos(datos),
    updated_at: new Date().toISOString(),
  };
  if (estado) patch.estado = estado;
  const r = await sbFetch(`/rest/v1/${DECA_AUTONOMO_TABLE}?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`No se pudo guardar DeCA (${r.status})`);
  const rows = await r.json().catch(() => []);
  return rowToDeca(Array.isArray(rows) ? rows[0] : rows);
}

export async function markAutonomoDecaPdfGenerado(id, pdfMeta = {}) {
  const row = await fetchAutonomoDecaById(id);
  const datos = mergeAutonomoDecaDatos({ ...(row?.datos || {}), ...pdfMeta });
  const now = new Date().toISOString();
  const r = await sbFetch(`/rest/v1/${DECA_AUTONOMO_TABLE}?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      estado: DECA_AUTONOMO_ESTADO.GENERADO,
      pdf_generado_at: now,
      datos,
      updated_at: now,
    }),
  });
  if (!r.ok) throw new Error(`No se pudo actualizar estado DeCA (${r.status})`);
  const rows = await r.json().catch(() => []);
  return rowToDeca(Array.isArray(rows) ? rows[0] : rows);
}

export async function archiveAutonomoDeca(id) {
  return saveAutonomoDecaDatos(id, (await fetchAutonomoDecaById(id))?.datos, {
    estado: DECA_AUTONOMO_ESTADO.ARCHIVADO,
  });
}

export async function deleteAutonomoDeca(id) {
  const r = await sbFetch(`/rest/v1/${DECA_AUTONOMO_TABLE}?id=eq.${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`No se pudo eliminar DeCA (${r.status})`);
}

const PDF_META_KEYS = [
  "pdf_storage_bucket",
  "pdf_storage_path",
  "pdf_archivo_nombre",
  "pdf_size_bytes",
  "pdf_has_qr",
  "deca_public_id",
  "deca_download_url",
  "deca_qr_png_bucket",
  "deca_qr_png_storage_path",
  "pdf_generado_en",
];

function stripAutonomoDecaPdfMeta(datos) {
  const d = { ...mergeAutonomoDecaDatos(datos) };
  for (const k of PDF_META_KEYS) delete d[k];
  return d;
}

export async function duplicateAutonomoDeca(deca, { profile = null } = {}) {
  if (!deca?.datos) throw new Error("DeCA inválido");
  const trip = stripAutonomoDecaPdfMeta(deca.datos);
  const fromProfile = profile ? autonomoDecaDatosFromProfile(profile) : {};
  return createAutonomoDeca({
    datos: mergeAutonomoDecaDatos({ ...trip, ...fromProfile }),
    userId: deca.userId,
    profile,
  });
}
