import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { getServicioMercanciaFromMeta } from "./servicioMercanciaMeta.js";
import { fetchPartesTransporte } from "./partesTransporteModel.js";
import {
  computeDcdtEstado,
  dcdtStatusUxLabel,
  isDcdtEstadoValidated,
  isDcdtFullyValidated,
  resolveDcdtDocument,
} from "./dcdtModel.js";
import { buildMercanciaDatosPatch, mercanciaEditFromDatos } from "./dcdtModel.js";
import {
  hasDecaPdfGenerado,
  isServicioInicioEfectivoAlcanzado,
  resolveServicioInicioEfectivoAt,
  shouldWarnDecaMissingBeforeStart,
} from "./decaPreStartCompliance.js";
import { fetchConductorVehiculoForDcdt } from "../empresa/conductorVehiculoEmpresa.js";
import { isDcdtPdfStale } from "./decaPdfStale.js";
import { DECA_SHORT_LABEL } from "./decaBranding.js";
import { isDecaAplicable } from "../service/servicioAlcance.js";

function dcdtNotApplicableReadiness() {
  return {
    doc: null,
    missing: [],
    datos: null,
    estado: null,
    estadoComputed: null,
    isValidated: false,
    isComplete: false,
    canValidate: false,
    canGeneratePdf: false,
    canDownloadPdf: false,
    statusLabel: "No aplica (servicio internacional)",
    hasPdfStorage: false,
    warnDecaMissingPdfBeforeStart: false,
    servicioInicioEfectivoAlcanzado: false,
    inicioEfectivoAt: null,
    pdfStale: false,
    decaAplicable: false,
  };
}

/** Contexto unificado para resolver DCDT (empresa y conductor). */
export async function fetchDcdtResolveContext({
  servicio,
  stops: stopsProp = null,
  empresa: empresaProp = null,
  conductorUid = null,
}) {
  const empresaId = servicio?.empresa_id || empresaProp?.id;
  const uid = conductorUid || servicio?.conductor_id || null;

  let stops = Array.isArray(stopsProp) ? stopsProp : [];
  if (!stops.length && servicio?.id) {
    const sr = await sbFetch(
      `/rest/v1/stops?servicio_id=eq.${servicio.id}&select=id,orden,tipo,nombre,direccion,notas&order=orden.asc`,
    );
    stops = sr.ok ? await sr.json().catch(() => []) : [];
    if (!Array.isArray(stops)) stops = [];
  }

  let empresa = empresaProp;
  if (empresaId) {
    const er = await sbFetch(
      `/rest/v1/empresas?id=eq.${empresaId}&select=id,nombre,cif,direccion,cp,ciudad,domicilio_fiscal,owner_id&limit=1`,
    );
    if (er.ok) {
      const rows = await er.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) empresa = { ...empresa, ...row };
    }
  }

  let empresaOwnerProfile = null;
  const ownerId = empresa?.owner_id;
  if (ownerId) {
    const pr = await sbFetch(
      `/rest/v1/profiles?id=eq.${ownerId}&select=id,nombre,cif,direccion,cp,ciudad&limit=1`,
    );
    if (pr.ok) {
      const rows = await pr.json().catch(() => []);
      empresaOwnerProfile = Array.isArray(rows) ? rows[0] : null;
    }
  }

  let conductor = null;
  if (uid) {
    conductor = await fetchConductorVehiculoForDcdt(uid, empresaId);
  }

  const partes = empresaId ? await fetchPartesTransporte(empresaId) : [];
  const masterById = {};
  for (const p of partes || []) masterById[p.id] = p;

  return {
    stops,
    empresa,
    empresaOwnerProfile,
    conductor,
    masterById,
  };
}

/** Mercancía efectiva: DCDT guardado + meta servicio (misma lógica que modal empresa). */
export function mergeDcdtDatosForReadiness(dcdt, servicio, mercanciaEdit = null) {
  const base = dcdt?.datos || {};
  const fromDcdt = mercanciaEditFromDatos(base.mercancia);
  const fromSvc = getServicioMercanciaFromMeta(servicio);
  const edit = mercanciaEdit || {};

  const descripcion =
    String(edit.descripcion ?? "").trim() ||
    fromDcdt.descripcion ||
    fromSvc.descripcion ||
    "";
  const pesoRaw = edit.peso_kg !== undefined && edit.peso_kg !== "" ? edit.peso_kg : fromDcdt.peso_kg || fromSvc.peso_kg;
  const bultosRaw = edit.bultos !== undefined && edit.bultos !== "" ? edit.bultos : fromDcdt.bultos || fromSvc.bultos;
  const paletsRaw = edit.palets !== undefined && edit.palets !== "" ? edit.palets : fromDcdt.palets || fromSvc.palets;

  return {
    ...base,
    mercancia: buildMercanciaDatosPatch({
      descripcion,
      peso_kg: pesoRaw,
      bultos: bultosRaw,
      palets: paletsRaw,
    }),
  };
}

/**
 * Única comprobación compartida empresa/conductor (persistido + resolveDcdtDocument).
 * El formulario de creación usa resolveDcdtReadinessFromForm() → misma resolución con DCDT sintético.
 * @returns {{ doc, missing, datos, estado, estadoComputed, isValidated, isComplete, canValidate, canGeneratePdf, canDownloadPdf, statusLabel, hasPdfStorage }}
 */
export function validateDcdtReadiness({
  servicio,
  dcdt,
  stops = [],
  masterById = {},
  empresa = null,
  empresaOwnerProfile = null,
  conductor = null,
  mercanciaEdit = null,
  flotaEvs = {},
}) {
  if (!isDecaAplicable(servicio)) {
    return dcdtNotApplicableReadiness();
  }

  if (!dcdt) {
    return {
      doc: null,
      missing: [],
      datos: null,
      estado: null,
      estadoComputed: null,
      isValidated: false,
      isComplete: false,
      canValidate: false,
      canGeneratePdf: false,
      canDownloadPdf: false,
      statusLabel: `${DECA_SHORT_LABEL} no disponible`,
      hasPdfStorage: false,
      warnDecaMissingPdfBeforeStart: false,
      servicioInicioEfectivoAlcanzado: false,
      inicioEfectivoAt: null,
      pdfStale: false,
      decaAplicable: true,
    };
  }

  const datos = mergeDcdtDatosForReadiness(dcdt, servicio, mercanciaEdit);
  const { doc, missing } = resolveDcdtDocument({
    servicio,
    stops,
    dcdt: { ...dcdt, datos },
    masterById,
    empresa,
    empresaOwnerProfile,
    conductor,
  });

  const estado = dcdt.estado;
  const estadoComputed = computeDcdtEstado({
    missing,
    evidenciasByStop: flotaEvs,
    datos,
    currentEstado: estado,
  });
  const isValidated = isDcdtFullyValidated({
    estado,
    missing,
    validacionSnapshot: dcdt.datos?.validacion_snapshot,
    validadoAt: dcdt.validadoAt,
  });
  const hasPdfStorage = hasDecaPdfGenerado(dcdt);
  const isComplete = missing.length === 0;
  const servicioInicioEfectivoAlcanzado = isServicioInicioEfectivoAlcanzado(servicio);
  const warnDecaMissingPdfBeforeStart = shouldWarnDecaMissingBeforeStart({ servicio, dcdt });

  const result = {
    doc,
    missing,
    datos,
    estado,
    estadoComputed,
    isValidated,
    isComplete,
    canValidate: isComplete && !isDcdtEstadoValidated(estado),
    /** Paso 6a: PDF con datos art. 6 completos, sin exigir validación tráfico previa. */
    canGeneratePdf: isComplete,
    canDownloadPdf: hasPdfStorage,
    statusLabel: dcdtStatusUxLabel({
      estado,
      missing,
      pdfGeneradoAt: dcdt.pdfGeneradoAt,
    }),
    hasPdfStorage,
    warnDecaMissingPdfBeforeStart,
    servicioInicioEfectivoAlcanzado,
    inicioEfectivoAt: resolveServicioInicioEfectivoAt(servicio),
    pdfStale: isDcdtPdfStale(dcdt),
    decaAplicable: true,
  };

  if (isDemoApp()) {
    console.log("[DCDT readiness]", {
      servicio_id: servicio?.id,
      dcdt_id: dcdt.id,
      estado,
      missing: missing.map((m) => m.key),
      isValidated: result.isValidated,
      hasPdfStorage,
    });
  }

  return result;
}
