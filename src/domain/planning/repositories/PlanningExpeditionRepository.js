import { sbFetch, ensureAuthAccessToken } from "../../../data/supabaseClient.js";
import { SERVICIO_OWNERSHIP, resolveServicioInsertContext } from "../../service/serviceOwnership.js";
import {
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
  ensureServicioHasStops,
} from "../../fleet/servicioAssignment.js";
import { asignarConductorEnServicioCreado } from "../../fleet/servicioCreateFlow.js";
import { mergeReferenciaOperacional } from "../../service/serviceOperacionMeta.js";
import { buildServiceIdentityMeta } from "../../service/serviceIdentity.js";
import { persistDcdtVehiculoOverridesForServicio } from "../../dcdt/dcdtModel.js";
import { TRANSPORT_OBLIGATION_ID_META_KEY } from "../constants/PlanningDomainSchemaVersion.js";

/**
 * Creación y asignación de expediciones (servicios) desde Planning BC.
 * Encapsula persistencia fleet sin llamadas legacy desde UI.
 */
export class PlanningExpeditionRepository {
  /**
   * Crea servicio en pendiente_asignacion vinculado a obligación (meta + paradas base).
   *
   * @param {{
   *   empresaId: string,
   *   authUid: string,
   *   transportObligationId: string,
   *   origen: string,
   *   destino: string,
   *   fechaInicio?: string|null,
   *   cliente?: string|null,
   *   referenciaCliente?: string|null,
   *   responsableUserId?: string|null,
   *   responsableNombre?: string|null,
   * }} input
   */
  async crearExpedicionPendiente(input) {
    await ensureAuthAccessToken();

    const insertCtx = await resolveServicioInsertContext({
      ownershipMode: SERVICIO_OWNERSHIP.FLEET_EMPRESA,
      empresaIdProp: input.empresaId,
      conductorIdProp: null,
      estado: SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
      uid: input.authUid,
      officeEmpresaId: input.empresaId,
    });

    const identityMeta = buildServiceIdentityMeta({
      cliente: input.cliente,
      referenciaCliente: input.referenciaCliente,
    });

    const referenciaMeta = {
      ...identityMeta,
      [TRANSPORT_OBLIGATION_ID_META_KEY]: input.transportObligationId,
      planning_expedition_v1: true,
    };

    const servicioId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `srv-${Date.now()}`;

    const referencia = mergeReferenciaOperacional(null, referenciaMeta);

    const payload = {
      id: servicioId,
      empresa_id: insertCtx.empresa_id,
      conductor_id: null,
      estado: SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
      origen: String(input.origen || "").trim() || "Origen",
      destino: String(input.destino || "").trim() || "Destino",
      referencia,
      fecha_inicio: input.fechaInicio || null,
      ...(input.responsableUserId ? { responsable_user_id: input.responsableUserId } : {}),
      ...(input.responsableNombre ? { responsable_nombre: input.responsableNombre } : {}),
    };

    const res = await sbFetch("/rest/v1/servicios", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || "No se pudo crear la expedición");
    }

    const rows = await res.json().catch(() => []);
    const servicio = Array.isArray(rows) ? rows[0] : rows;

    await ensureServicioHasStops({
      servicioId,
      origen: payload.origen,
      destino: payload.destino,
    });

    const refreshed = await sbFetch(
      `/rest/v1/servicios?id=eq.${encodeURIComponent(servicioId)}&select=*&limit=1`
    );
    const refreshedRows = refreshed.ok ? await refreshed.json().catch(() => []) : [];
    return Array.isArray(refreshedRows) && refreshedRows[0] ? refreshedRows[0] : servicio;
  }

  /**
   * Asigna conductor, vehículo y remolque; opcional notificación push.
   *
   * @param {{
   *   servicioId: string,
   *   servicio: Record<string, unknown>,
   *   conductorId: string,
   *   conductorNombre?: string|null,
   *   matricula?: string|null,
   *   remolque?: string|null,
   *   origen?: string|null,
   *   destino?: string|null,
   *   fechaInicio?: string|null,
   *   notifyAssignment?: (payload: { conductorId: string, servicioId: string, origen?: string, destino?: string, fechaInicio?: string|null }) => Promise<void>|void,
   * }} input
   */
  async asignarYEnviarAlConductor(input) {
    const assignResult = await asignarConductorEnServicioCreado({
      servicioId: input.servicioId,
      servicio: input.servicio,
      conductorId: input.conductorId,
      conductorNombre: input.conductorNombre ?? null,
      origen: input.origen ?? input.servicio?.origen,
      destino: input.destino ?? input.servicio?.destino,
      fechaInicio: input.fechaInicio ?? input.servicio?.fecha_inicio,
      skipEnsureStops: true,
    });

    if (input.matricula || input.remolque) {
      await persistDcdtVehiculoOverridesForServicio(input.servicioId, {
        matricula: input.matricula || null,
        remolque: input.remolque || null,
      });
    }

    if (typeof input.notifyAssignment === "function") {
      await input.notifyAssignment({
        conductorId: input.conductorId,
        servicioId: input.servicioId,
        origen: String(input.origen ?? input.servicio?.origen ?? ""),
        destino: String(input.destino ?? input.servicio?.destino ?? ""),
        fechaInicio: input.fechaInicio ?? input.servicio?.fecha_inicio ?? null,
      });
    }

    const getRes = await sbFetch(
      `/rest/v1/servicios?id=eq.${encodeURIComponent(input.servicioId)}&select=*&limit=1`
    );
    const rows = getRes.ok ? await getRes.json().catch(() => []) : [];
    const servicio =
      Array.isArray(rows) && rows[0]
        ? rows[0]
        : {
            ...input.servicio,
            id: input.servicioId,
            conductor_id: input.conductorId,
            estado: "asignado",
            referencia: assignResult?.referencia ?? input.servicio?.referencia,
          };

    return { assignResult, servicio };
  }
}

export const planningExpeditionRepository = new PlanningExpeditionRepository();
