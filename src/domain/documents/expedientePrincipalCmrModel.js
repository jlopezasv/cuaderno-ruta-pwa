function parseTs(v) {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isCmrEvidence(ev) {
  if (!ev || ev.incidencia_id) return false;
  const bucket = ev.bucket || ev.tipo;
  return String(bucket || "").toLowerCase() === "cmr" || String(ev.tipo || "").toLowerCase() === "cmr";
}

export const PRINCIPAL_CMR_OCR_FIELDS = [
  { key: "num_cmr", label: "Número CMR" },
  { key: "remitente", label: "Expedidor" },
  { key: "destinatario", label: "Destinatario" },
  { key: "lugar_carga", label: "Lugar carga" },
  { key: "lugar_entrega", label: "Lugar descarga" },
  { key: "fecha", label: "Fecha" },
  { key: "matricula", label: "Matrícula" },
  { key: "transportista", label: "Transportista" },
  { key: "mercancia", label: "Mercancía" },
  { key: "peso_kg", label: "Peso" },
  { key: "bultos", label: "Bultos" },
  { key: "observaciones", label: "Observaciones" },
];

export function resolvePrincipalCmr(evidencias = []) {
  const cmrs = (evidencias || []).filter(isCmrEvidence);
  if (!cmrs.length) return null;
  return [...cmrs].sort((a, b) => parseTs(b.created_at) - parseTs(a.created_at))[0];
}

export function splitExpedienteEvidencias(evidencias = []) {
  const principalCmr = resolvePrincipalCmr(evidencias);
  const principalId = principalCmr?.id || null;
  const additionalEvidencias = (evidencias || []).filter((ev) => {
    if (ev?.incidencia_id) return true;
    if (principalId && ev.id === principalId) return false;
    return true;
  });
  return { principalCmr, additionalEvidencias };
}

function formatValue(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v);
}

export function extractPrincipalCmrOcrRows(principalCmr, { emptyLabel = "No detectado" } = {}) {
  const datos = principalCmr?.datos && typeof principalCmr.datos === "object" ? principalCmr.datos : {};
  return PRINCIPAL_CMR_OCR_FIELDS.map(({ key, label }) => {
    const raw = formatValue(datos[key]);
    return { key, label, value: raw || emptyLabel, detected: !!raw };
  });
}

export function principalCmrHasOcrData(principalCmr) {
  const datos = principalCmr?.datos;
  if (!datos || typeof datos !== "object") return false;
  return PRINCIPAL_CMR_OCR_FIELDS.some(({ key }) => formatValue(datos[key]));
}

export function formatExpedienteEvidenceDate(ev) {
  const ts = ev?.created_at;
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function additionalEvidenceTypeLabel(ev) {
  if (ev?.incidencia_id) return "Incidencia";
  const tipo = String(ev?.tipo || ev?.bucket || "").toLowerCase();
  if (tipo === "cmr") return "CMR anterior";
  if (tipo === "foto" || tipo === "fotos") {
    const title = String(ev?.displayTitle || "").toLowerCase();
    if (title.includes("carga")) return "Foto carga";
    if (title.includes("descarga")) return "Foto descarga";
    return "Foto operativa";
  }
  if (tipo === "ticket") return "Albarán";
  if (tipo === "factura") return "Documento empresa";
  if (ev?.source === "servicio_documentos_extra") return "Documento empresa";
  return ev?.displayTitle || ev?.displayKindLabel || "Documento";
}

export function additionalEvidenceStopLabel(ev) {
  return ev?.stopLabel || ev?.stopName || ev?.displaySubtitle?.split(" · ")?.[2] || "—";
}
