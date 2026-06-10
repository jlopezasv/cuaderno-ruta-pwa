export const ESTADOS_COMERCIALES = Object.freeze([
  { id: "pendiente_contactar", label: "Pendiente contactar" },
  { id: "contactado", label: "Contactado" },
  { id: "interesado", label: "Interesado" },
  { id: "demo_prevista", label: "Demo prevista" },
  { id: "demo_realizada", label: "Demo realizada" },
  { id: "prueba_activa", label: "Prueba activa" },
  { id: "cliente", label: "Cliente" },
  { id: "no_interesado", label: "No interesado" },
]);

export const TIPOS_VEHICULO = Object.freeze([
  "Frigo",
  "Lona",
  "Portacontenedores",
  "Cisterna",
  "Paquetería",
  "Otros",
]);

export const TIPOS_RUTA = Object.freeze([
  "Local",
  "Nacional",
  "Internacional",
  "UK / Ferry",
  "Europa",
  "Marruecos",
]);

export const SISTEMAS_ACTUALES = Object.freeze([
  "Excel",
  "WhatsApp",
  "EjidoSoft",
  "Kaleido",
  "Otro TMS",
  "GPS / Webfleet / TomTom",
  "No sabe",
]);

export const DOLORES_DETECTADOS = Object.freeze([
  "Documentación",
  "Control conductor",
  "Incidencias",
  "Muelles / esperas",
  "Comunicación",
  "Facturación",
  "Planificación",
  "Otro",
]);

export const TIPOS_ACCION = Object.freeze([
  { id: "llamada", label: "Llamada" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
  { id: "visita", label: "Visita" },
  { id: "demo", label: "Demo" },
  { id: "seguimiento", label: "Seguimiento" },
]);

export const AGENDA_VISTAS = Object.freeze({
  TODAS: "todas",
  HOY: "hoy",
  SEMANA: "semana",
  PROXIMAS: "proximas",
  VENCIDAS: "vencidas",
});

export function estadoComercialLabel(id) {
  return ESTADOS_COMERCIALES.find((e) => e.id === id)?.label || id || "—";
}

export function tipoAccionLabel(id) {
  return TIPOS_ACCION.find((t) => t.id === id)?.label || id || "—";
}
