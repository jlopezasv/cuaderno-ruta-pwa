import { buildPlan, fmtT, fmtDur } from "../route/routePlanning.js";

function formatArrivalLabel(arrival, now = new Date()) {
  const d = arrival instanceof Date ? arrival : new Date(arrival);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d0 = new Date(d);
  d0.setHours(0, 0, 0, 0);
  const timeStr = fmtT(d);
  if (d0.getTime() === today.getTime()) return `Hoy · ${timeStr}`;
  if (d0.getTime() === tomorrow.getTime()) return `Mañana · ${timeStr}`;
  const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} · ${timeStr}`;
}

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
      etaPlanNormativoLabel: formatArrivalLabel(arrival),
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
