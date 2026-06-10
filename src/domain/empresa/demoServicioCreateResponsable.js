import { isDemoApp } from "../../config/appEnvironment.js";
import {
  buildResponsableServicioPayload,
  validateOfficeResponsableOnCreate,
} from "./empresaOfficeUsers.js";
import { parsePostgrestError } from "../service/serviceCreateStepTrace.js";

/** DEMO: jefe_flota / tráfico → responsable actual si no hay selección. */
export function resolveDemoResponsableIdForCreate({ officeUser, responsableId, authUid }) {
  if (!isDemoApp()) return responsableId || null;
  if (responsableId) return responsableId;
  if (!officeUser?.activo) return null;
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "jefe_flota" || rol === "trafico") {
    return officeUser.userId || authUid || null;
  }
  return null;
}

/** DEMO: no exige lista de responsables si el rol puede auto-asignarse. */
export function validateDemoOfficeResponsableOnCreate({ officeUser, responsableId, officeResponsables }) {
  if (!isDemoApp()) {
    return validateOfficeResponsableOnCreate({ officeUser, responsableId, officeResponsables });
  }
  if (!officeUser?.activo) return null;
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "administrativo") return "No tienes permiso para crear servicios.";
  if (rol === "trafico" && !officeUser.puedeVerTodos) {
    const uid = officeUser.userId;
    if (!responsableId || responsableId !== uid) {
      return "El responsable debe ser tu usuario de tráfico.";
    }
    return null;
  }
  if (rol === "trafico" && officeUser.puedeVerTodos && !responsableId) {
    return "Selecciona un responsable del servicio.";
  }
  return null;
}

export function buildDemoResponsableServicioPayload(responsableId, officeResponsables) {
  return buildResponsableServicioPayload(responsableId, officeResponsables);
}

/** Campos multiusuario que pueden faltar en DEMO si no se aplicó migración SQL. */
export function stripDemoServicioResponsableFields(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  delete next.responsable_user_id;
  delete next.responsable_nombre;
  return next;
}

export function stripDemoServicioClientId(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  delete next.id;
  return next;
}

export function shouldDemoRetryServicioCreateWithoutResponsable(status, errText) {
  if (!isDemoApp() || status !== 400) return false;
  const parsed = parsePostgrestError(errText);
  const blob = `${parsed.code || ""} ${parsed.message || ""} ${errText || ""}`.toLowerCase();
  return (
    parsed.code === "PGRST204" ||
    /responsable_user_id|responsable_nombre/.test(blob) ||
    /could not find.*column|schema cache/i.test(blob)
  );
}

/** Mensaje legible con code / message / details / hint de PostgREST. */
export function formatDemoServicioCreateError(err) {
  const base = err?.message || String(err);
  const parts = [base];
  if (err?.pgCode) parts.push(`code: ${err.pgCode}`);
  if (err?.raw) {
    try {
      const j = JSON.parse(err.raw);
      if (j?.details && j.details !== base) parts.push(`details: ${j.details}`);
      if (j?.hint) parts.push(`hint: ${j.hint}`);
    } catch (_) {
      if (err.raw && err.raw !== base && err.raw.length < 500) parts.push(err.raw);
    }
  }
  return parts.join(" · ");
}
