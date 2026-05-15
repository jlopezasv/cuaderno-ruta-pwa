export const OPERATIONAL_STATUS_META = Object.freeze({
  operativo: Object.freeze({ label: "Operativo", color: "#22C55E", icon: "🟢" }),
  esperando: Object.freeze({ label: "Esperando", color: "#F59E0B", icon: "🟡" }),
  bloqueado: Object.freeze({ label: "Bloqueado", color: "#EF4444", icon: "🔴" }),
  incidencia: Object.freeze({ label: "Incidencia", color: "#F97316", icon: "⚠️" }),
});

export function getOperationalStatus({ service, stops, evidencias }) {
  const hasIncidencia = Array.isArray(evidencias)
    ? evidencias.some((ev) => ev?.tipo === "incidencia")
    : (Array.isArray(stops) ? stops : []).some((st) =>
        Array.isArray(evidencias?.[st.id]) && evidencias[st.id].some((ev) => ev?.tipo === "incidencia")
      );

  if (hasIncidencia) return "incidencia";
  if (service?.estado === "pendiente_asignacion") return "esperando";
  if (service?.estado === "asignado") return "esperando";
  if (service?.estado === "en_curso") return "operativo";
  if (service?.estado === "completado") return "operativo";
  return "esperando";
}
