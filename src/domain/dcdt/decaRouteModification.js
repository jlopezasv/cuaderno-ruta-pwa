import { isDemoApp } from "../../config/appEnvironment.js";
import {
  SERVICIO_ESTADO_ASIGNADO,
  SERVICIO_ESTADO_EN_CURSO,
} from "../fleet/serviceStatus.js";
import {
  buildMercanciaDatosPatch,
  resolveDcdtDocument,
  saveDcdtDatos,
} from "./dcdtModel.js";
import { generateAndPersistDcdtPdf } from "./dcdtPdfDocument.js";
import {
  hasDecaPdfGenerado,
  isServicioInicioEfectivoAlcanzado,
} from "./decaPreStartCompliance.js";

const ESTADOS_TERMINALES_RUTA = new Set(["completado", "cerrado", "cancelado", "anulado"]);

/** Demo: VITE_APP_ENV=demo o host cuaderno-demo (Vercel). */
export function isDecaRouteModificationDemoSurface() {
  if (isDemoApp()) return true;
  if (typeof window === "undefined") return false;
  return /cuaderno-demo/i.test(window.location.hostname);
}

/** Campos art. 6 editables durante el servicio en curso (Paso 6b demo). */
export const DECA_RUTA_FIELD_DEFS = Object.freeze([
  { key: "vehiculo.matricula", label: "Matrícula tractora", formKey: "matricula" },
  { key: "vehiculo.remolque", label: "Matrícula remolque", formKey: "remolque" },
  { key: "mercancia.descripcion", label: "Naturaleza de la mercancía", formKey: "descripcion" },
  { key: "mercancia.peso_kg", label: "Peso (kg)", formKey: "peso_kg" },
  { key: "mercancia.bultos", label: "Bultos", formKey: "bultos" },
  { key: "mercancia.palets", label: "Palets", formKey: "palets" },
]);

function getDocFieldValue(doc, key) {
  const parts = key.split(".");
  let v = doc;
  for (const p of parts) v = v?.[p];
  if (v == null || v === "") return "";
  return String(v).trim();
}

function normalizeCompare(val) {
  if (val == null || val === "") return "";
  return String(val).trim();
}

export function buildRutaModFormFromDoc(doc) {
  return {
    matricula: getDocFieldValue(doc, "vehiculo.matricula"),
    remolque: getDocFieldValue(doc, "vehiculo.remolque"),
    descripcion: getDocFieldValue(doc, "mercancia.descripcion"),
    peso_kg: getDocFieldValue(doc, "mercancia.peso_kg"),
    bultos: getDocFieldValue(doc, "mercancia.bultos"),
    palets: getDocFieldValue(doc, "mercancia.palets"),
  };
}

export function buildModificacionesRutaEntries(docBefore, formAfter, motivo, userId) {
  const m = String(motivo || "").trim();
  if (!m) throw new Error("Indica el motivo del cambio en ruta");

  const at = new Date().toISOString();
  const entries = [];

  for (const def of DECA_RUTA_FIELD_DEFS) {
    const antes = normalizeCompare(getDocFieldValue(docBefore, def.key));
    const despues = normalizeCompare(formAfter[def.formKey]);
    if (antes === despues) continue;
    entries.push({
      campo: def.label,
      campo_key: def.key,
      valor_anterior: antes || "—",
      valor_nuevo: despues || "—",
      motivo: m,
      modificado_por: userId || null,
      modificado_at: at,
    });
  }

  if (!entries.length) throw new Error("No hay cambios respecto al DeCA actual");
  return entries;
}

export function applyRutaModFormToDatos(datos, form) {
  const mercancia = buildMercanciaDatosPatch({
    descripcion: form.descripcion,
    peso_kg: form.peso_kg,
    bultos: form.bultos,
    palets: form.palets,
  });
  const matricula = String(form.matricula || "").trim();
  const remolque = String(form.remolque || "").trim();
  return {
    ...datos,
    vehiculo: {
      ...(datos.vehiculo || {}),
      use_conductor_matricula: matricula ? true : datos.vehiculo?.use_conductor_matricula,
      matricula_override: matricula || datos.vehiculo?.matricula_override || null,
      remolque_override: remolque || null,
    },
    mercancia: { ...(datos.mercancia || {}), ...mercancia },
  };
}

/** Servicio operativo con PDF DeCA ya generado (asignado/en curso o viaje iniciado). */
export function canModificarDecaEnRuta({ servicio, dcdt }) {
  if (!servicio?.id || !dcdt?.id) return false;
  if (!hasDecaPdfGenerado(dcdt)) return false;
  const st = String(servicio.estado || "").toLowerCase();
  if (ESTADOS_TERMINALES_RUTA.has(st)) return false;
  if (st === SERVICIO_ESTADO_EN_CURSO || st === SERVICIO_ESTADO_ASIGNADO) return true;
  return isServicioInicioEfectivoAlcanzado(servicio);
}

/** Motivo por el que no aparece «Modificar en ruta» (null = debería mostrarse). */
export function getModificarEnRutaBlockedReason({ servicio, dcdt, demoSurface = true }) {
  if (!demoSurface) {
    return "Solo en demo (https://cuaderno-demo-ab.vercel.app)";
  }
  if (!dcdt?.id) return "Cargando DCDT…";
  if (!hasDecaPdfGenerado(dcdt)) return "Genera el PDF DeCA antes de modificar en ruta";
  const st = String(servicio?.estado || "").toLowerCase() || "(sin estado)";
  if (ESTADOS_TERMINALES_RUTA.has(st)) {
    return `Servicio «${st}» — ya no admite cambios en ruta`;
  }
  if (
    st !== SERVICIO_ESTADO_EN_CURSO &&
    st !== SERVICIO_ESTADO_ASIGNADO &&
    !isServicioInicioEfectivoAlcanzado(servicio)
  ) {
    return `Servicio «${st}» — debe estar asignado, en curso o con viaje iniciado`;
  }
  return null;
}

/**
 * Guarda histórico, marca pdf_stale vía saveDcdtDatos y regenera PDF al instante (mismo deca_public_id).
 */
export async function confirmDecaRouteModification({
  dcdt,
  servicio,
  docBefore,
  form,
  motivo,
  userId,
  userLabel = null,
  stops = [],
  masterById = {},
  empresa = null,
  empresaOwnerProfile = null,
  conductor = null,
}) {
  const entries = buildModificacionesRutaEntries(docBefore, form, motivo, userId);
  const prevMods = Array.isArray(dcdt.datos?.modificaciones_ruta) ? dcdt.datos.modificaciones_ruta : [];
  const nextDatos = applyRutaModFormToDatos(dcdt.datos, form);
  nextDatos.modificaciones_ruta = [...prevMods, ...entries];

  const saved = await saveDcdtDatos(dcdt.id, nextDatos, dcdt.estado);

  const { doc: docLive } = resolveDcdtDocument({
    servicio,
    stops,
    dcdt: saved,
    masterById,
    empresa,
    empresaOwnerProfile,
    conductor,
  });

  const docForPdf = {
    ...docLive,
    validado_at: saved.validadoAt || docBefore?.validado_at || null,
    modificaciones_ruta: nextDatos.modificaciones_ruta,
  };

  const { dcdt: afterPdf } = await generateAndPersistDcdtPdf({
    servicio,
    dcdt: saved,
    doc: docForPdf,
    userId,
    userLabel,
    downloadAfter: false,
  });

  return { dcdt: afterPdf, entries };
}
