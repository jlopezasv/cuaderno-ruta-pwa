import { getUserId, sbFetch } from "../../data/supabaseClient.js";
import { DECA_AUTONOMO_ESTADO } from "./decaAutonomoConstants.js";
import { saveAutonomoDecaDatos } from "./decaAutonomoModel.js";
import { DCDT_TABLE } from "./dcdtConstants.js";
import {
  ensureDcdtForServicio,
  fetchAllDcdtByServicio,
  saveDcdtDatos,
} from "./dcdtModel.js";
import { generateAndPersistDcdtPdf } from "./dcdtPdfDocument.js";
import { fetchDcdtResolveContext, validateDcdtReadiness } from "./dcdtReadiness.js";
import { hasDecaPdfGenerado } from "./decaPreStartCompliance.js";
import { fetchDriverOperationalCandidates } from "../service/driverFlatStopList.js";
import { isDecaAplicable } from "../service/servicioAlcance.js";
import { mergeAutonomoDecaDatos } from "../../features/dcdt/decaAutonomoFormDefaults.js";
import {
  autonomoDatosToDcdtDatos,
  canLinkAutonomoDecaToServicio,
  isAutonomoDecaLinkedToServicio,
} from "./autonomoDatosToDcdtDatos.js";

const LINKABLE_ESTADOS = new Set(["en_curso", "asignado", "pendiente_asignacion"]);

function mergeConductorDatosOntoDcdt(existingDatos, mapped) {
  const prev = existingDatos && typeof existingDatos === "object" ? existingDatos : {};
  return {
    ...prev,
    ...mapped,
    partes: {
      ...(prev.partes || {}),
      ...(mapped.partes || {}),
      cargador_id: prev.partes?.cargador_id || mapped.partes?.cargador_id || null,
      destinatario_id: prev.partes?.destinatario_id || mapped.partes?.destinatario_id || null,
      cargador_overrides: mapped.partes?.cargador_overrides || {},
      destinatario_overrides: mapped.partes?.destinatario_overrides || {},
    },
    mercancia: { ...(prev.mercancia || {}), ...(mapped.mercancia || {}) },
    vehiculo: { ...(prev.vehiculo || {}), ...(mapped.vehiculo || {}) },
  };
}

function alreadyExistsError(dcdt) {
  const err = new Error("Este viaje ya tiene DeCA de empresa. No se crea un segundo documento.");
  err.code = "DECA_ALREADY_EXISTS";
  err.dcdt = dcdt;
  return err;
}

/**
 * Crea (o rellena un borrador propio) el DeCA del servicio y opcionalmente genera PDF/QR de flota.
 */
export async function emitConductorServicioDeca({
  servicio,
  empresa = null,
  stops = null,
  autonomoDatos,
  autonomoDecaId = null,
  conductorUid = null,
  andPdf = true,
  downloadAfter = false,
} = {}) {
  if (!servicio?.id || !servicio.empresa_id) {
    throw new Error("Hace falta un viaje de empresa");
  }
  if (!isDecaAplicable(servicio)) {
    throw new Error("Este viaje no admite DeCA (internacional)");
  }

  const uid = conductorUid || getUserId();
  const ctx = await fetchDcdtResolveContext({
    servicio,
    stops,
    empresa,
    conductorUid: uid,
  });

  const existing = await fetchAllDcdtByServicio(servicio.id);
  let dcdt = null;
  if (existing.length) {
    const row = existing[0];
    const reusable = row?.datos?.emitido_por_conductor && !hasDecaPdfGenerado(row);
    if (!reusable) throw alreadyExistsError(row);
    dcdt = row;
  } else {
    try {
      dcdt = await ensureDcdtForServicio({
        servicioId: servicio.id,
        empresaId: servicio.empresa_id,
        stops: ctx.stops,
        servicio,
      });
    } catch (e) {
      throw new Error(
        e?.message || "No se pudo crear el DeCA de este viaje. Comprueba que estás asignado.",
      );
    }
  }
  if (!dcdt?.id) throw new Error("No se pudo crear el DeCA de este viaje");

  const mapped = autonomoDatosToDcdtDatos(autonomoDatos, { autonomoDecaId });
  const nextDatos = mergeConductorDatosOntoDcdt(dcdt.datos, mapped);
  const saved = await saveDcdtDatos(dcdt.id, nextDatos);

  if (!andPdf) return { dcdt: saved };

  const readiness = validateDcdtReadiness({
    servicio,
    dcdt: saved,
    stops: ctx.stops,
    masterById: ctx.masterById,
    empresa: ctx.empresa,
    empresaOwnerProfile: ctx.empresaOwnerProfile,
    conductor: ctx.conductor,
  });
  if (!readiness.canGeneratePdf || !readiness.doc) {
    const labels = (readiness.missing || []).map((m) => m.label).join(", ");
    const err = new Error(
      labels ? `Faltan datos para el PDF: ${labels}` : "No se pudo armar el documento DeCA",
    );
    err.code = "DECA_INCOMPLETE";
    err.dcdt = saved;
    throw err;
  }

  const generated = await generateAndPersistDcdtPdf({
    servicio,
    dcdt: saved,
    doc: readiness.doc,
    userId: uid,
    downloadAfter,
  });
  return { dcdt: generated.dcdt };
}

export async function listServiciosSinDecaForConductor(uid = null) {
  const userId = uid || getUserId();
  if (!userId) return [];
  const { candidates } = await fetchDriverOperationalCandidates(userId);
  const empresas = (candidates || []).filter(
    (s) =>
      s?.id &&
      s.empresa_id &&
      isDecaAplicable(s) &&
      LINKABLE_ESTADOS.has(String(s.estado || "").toLowerCase()),
  );
  if (!empresas.length) return [];

  const ids = empresas.map((s) => s.id);
  const r = await sbFetch(`/rest/v1/${DCDT_TABLE}?servicio_id=in.(${ids.join(",")})&select=servicio_id`);
  if (!r.ok) return [];
  const taken = new Set();
  const rows = await r.json().catch(() => []);
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (row?.servicio_id) taken.add(row.servicio_id);
  });
  return empresas.filter((s) => !taken.has(s.id));
}

/** Copia un DeCA suelto al viaje si ese servicio aún no tiene dcdt_servicio. */
export async function linkAutonomoDecaToServicio({ deca, servicio, conductorUid = null } = {}) {
  if (!canLinkAutonomoDecaToServicio(deca)) {
    throw new Error(
      isAutonomoDecaLinkedToServicio(deca)
        ? "Este DeCA ya se usó en un servicio"
        : "Este DeCA no se puede vincular",
    );
  }
  const { dcdt } = await emitConductorServicioDeca({
    servicio,
    autonomoDatos: deca.datos,
    autonomoDecaId: deca.id,
    conductorUid,
    andPdf: true,
    downloadAfter: false,
  });
  const nextDatos = mergeAutonomoDecaDatos({
    ...(deca.datos || {}),
    vinculado_servicio_id: servicio.id,
    vinculado_dcdt_id: dcdt.id,
  });
  await saveAutonomoDecaDatos(deca.id, nextDatos, { estado: DECA_AUTONOMO_ESTADO.ARCHIVADO });
  return dcdt;
}
