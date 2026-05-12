import { buildPlan, fmtDur } from "../route/routePlanning.js";
import { formatOperationalEtaLabel } from "./etaFormatter.js";

/**
 * Misma fórmula que Nora / MapTab: buildPlan sobre km del viaje activo y offsets normativos.
 */
export function getViajePlanningSummary(viajeActivo, norma) {
  if (!viajeActivo?.km) return null;
  try {
    const mins = Math.round((viajeActivo.km / (viajeActivo.velocidad || 80)) * 60);
    const plan = buildPlan(mins, null, {
      contUsed: norma?.cont ?? 0,
      dayUsed: norma?.todayDrive ?? 0,
      weekUsed: norma?.weekDrive ?? 0,
      extUsed: norma?.extUsed ?? 0,
      useReduced: true,
      useExtended: true,
      start: new Date(),
      km: viajeActivo.km,
    });
    const arrival = plan.arrival instanceof Date ? plan.arrival : new Date(plan.arrival);
    const proxSeg = plan.segs?.find((s) => s.type !== "conduccion");
    const proximaParadaNormativa =
      proxSeg && plan.PLBL ? plan.PLBL[proxSeg.type] || proxSeg.type : "—";

    return {
      destinoViaje: viajeActivo.destino,
      km: viajeActivo.km,
      etaPlanNormativoLabel: formatOperationalEtaLabel(arrival) || "—",
      proximaParadaNormativa,
      plan,
    };
  } catch {
    return null;
  }
}

/** Tiempo de conducción aún permitido (norma EU) — mismo `canDrive` que el resto de la app. */
export function formatTiempoConduccionDisponible(norma) {
  if (!norma || norma.canDrive == null) return "—";
  return fmtDur(norma.canDrive);
}
