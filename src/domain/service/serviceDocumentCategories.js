import { DECA_FULL_TITLE, DECA_LEGAL_REF, DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";

/** Categorías documentales independientes por servicio (gestor empresa). */

export const SERVICE_DOC_CATEGORY = Object.freeze({
  EXPEDIENTE: "expediente",
  DCDT: "dcdt",
  CHAT: "chat",
});

export const SERVICE_DOC_CATEGORY_ORDER = [
  SERVICE_DOC_CATEGORY.EXPEDIENTE,
  SERVICE_DOC_CATEGORY.DCDT,
  SERVICE_DOC_CATEGORY.CHAT,
];

export const SERVICE_DOC_CATEGORY_META = Object.freeze({
  [SERVICE_DOC_CATEGORY.EXPEDIENTE]: {
    id: SERVICE_DOC_CATEGORY.EXPEDIENTE,
    label: "Expediente Operacional",
    headerTitle: "EXPEDIENTE OPERACIONAL",
    headerSubtitle: "Informe operacional, timeline, anexos e incidencias",
    pdfFilename: "expediente-operacional",
    defaultSendToClient: true,
  },
  [SERVICE_DOC_CATEGORY.DCDT]: {
    id: SERVICE_DOC_CATEGORY.DCDT,
    label: DECA_SHORT_LABEL,
    headerTitle: DECA_FULL_TITLE,
    headerSubtitle: `${DECA_FULL_TITLE} · ${DECA_LEGAL_REF}`,
    pdfFilename: "deca",
    defaultSendToClient: true,
  },
  [SERVICE_DOC_CATEGORY.CHAT]: {
    id: SERVICE_DOC_CATEGORY.CHAT,
    label: "Chat Operativo",
    headerTitle: "CHAT OPERATIVO",
    headerSubtitle: "Comunicación interna empresa–conductor (no incluido en expediente salvo envío explícito)",
    pdfFilename: "chat-operativo",
    defaultSendToClient: false,
  },
});

const LS_PREFIX = "cuaderno_svc_doc_mail_";

function readKey(servicioId) {
  return `${LS_PREFIX}${servicioId}`;
}

/** Preferencias «Enviar al cliente» por servicio (localStorage). */
export function readServiceDocMailPrefs(servicioId) {
  const defaults = Object.fromEntries(
    SERVICE_DOC_CATEGORY_ORDER.map((id) => [
      id,
      SERVICE_DOC_CATEGORY_META[id].defaultSendToClient,
    ]),
  );
  if (!servicioId) return defaults;
  try {
    const raw = localStorage.getItem(readKey(servicioId));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function writeServiceDocMailPrefs(servicioId, prefs) {
  if (!servicioId) return;
  try {
    localStorage.setItem(readKey(servicioId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function defaultServiceDocMailSelection(prefs = null) {
  const p = prefs || Object.fromEntries(
    SERVICE_DOC_CATEGORY_ORDER.map((id) => [
      id,
      SERVICE_DOC_CATEGORY_META[id].defaultSendToClient,
    ]),
  );
  return {
    expediente: !!p.expediente,
    dcdt: !!p.dcdt,
    chat: !!p.chat,
  };
}

/** Expediente sin DeCA en listado del informe (las páginas DeCA se fusionan al final del PDF). */
export function expedienteForOperacionalCategory(expediente) {
  if (!expediente) return null;
  const evidencias = (expediente.evidencias || []).filter((ev) => {
    const tipo = String(ev?.tipo || "").toLowerCase();
    if (tipo === "dcdt") return false;
    if (ev?.bucket === "dcdt") return false;
    return true;
  });
  return {
    ...expediente,
    evidencias,
    comunicacionesCliente: [],
  };
}
