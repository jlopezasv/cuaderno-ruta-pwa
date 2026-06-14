/** Tema visual compartido — formulario servicio / preparación DCDT (demo). */

export const SERVICIO_MODAL_SHELL = {
  width: "90vw",
  maxWidth: 1450,
  maxHeight: "92vh",
};

export const SERVICIO_FORM_TONES = {
  carga: {
    bg: "#fff7ed",
    border: "#fdba74",
    header: "#9a3412",
    soft: "#ffedd5",
  },
  descarga: {
    bg: "#eff6ff",
    border: "#93c5fd",
    header: "#1d4ed8",
    soft: "#dbeafe",
  },
  mercancia: {
    bg: "#f0fdf4",
    border: "#86efac",
    header: "#166534",
    soft: "#dcfce7",
  },
  dcdt: {
    bg: "#f8fafc",
    border: "#cbd5e1",
    header: "#334155",
    soft: "#e2e8f0",
  },
  parada: {
    bg: "#f8fafc",
    border: "#dbe4ee",
    header: "#475569",
    soft: "#f1f5f9",
  },
};

export const CORPORATE_BTN = {
  primary: {
    bg: "#16a34a",
    bgDisabled: "#cbd5e1",
    color: "#ffffff",
    border: "#86efac",
  },
  secondary: {
    bg: "#f1f5f9",
    color: "#64748b",
    border: "#dbe4ee",
  },
  danger: {
    bg: "#fff1f2",
    color: "#b91c1c",
    border: "#fecaca",
  },
};

export function getStopTone(stop) {
  const t = String(stop?.tipo || "").toLowerCase();
  if (t === "carga") return SERVICIO_FORM_TONES.carga;
  if (t === "descarga") return SERVICIO_FORM_TONES.descarga;
  return SERVICIO_FORM_TONES.parada;
}

export function resolveConductorVehiculo(conductores, conductorId) {
  const c = (conductores || []).find((x) => x.user_id === conductorId);
  return {
    matricula: String(c?.matricula || "").trim(),
    remolque: String(c?.remolque || "").trim(),
    tipoVehiculo: String(c?.tipo_vehiculo || c?.tipoVehiculo || "articulado").trim(),
    nombre: c?.nombre || "",
  };
}

export function primaryButtonStyle(disabled = false) {
  return {
    flex: 1,
    background: disabled ? CORPORATE_BTN.primary.bgDisabled : CORPORATE_BTN.primary.bg,
    color: disabled ? "#64748b" : CORPORATE_BTN.primary.color,
    border: `1px solid ${CORPORATE_BTN.primary.border}`,
    borderRadius: 12,
    padding: "12px",
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
  };
}

export function secondaryButtonStyle(disabled = false) {
  return {
    flex: 1,
    background: CORPORATE_BTN.secondary.bg,
    color: CORPORATE_BTN.secondary.color,
    border: `1px solid ${CORPORATE_BTN.secondary.border}`,
    borderRadius: 12,
    padding: "12px",
    fontSize: 15,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
  };
}
