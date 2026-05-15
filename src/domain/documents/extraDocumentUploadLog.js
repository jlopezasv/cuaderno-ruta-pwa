/** Logs temporales de depuración — flujo documentos extra. Filtrar consola: DOCUMENT_ */

const PREFIX = "[DOCUMENT_EXTRA]";

export function logExtraDoc(stage, detail = {}) {
  const payload =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? { stage, ...detail }
      : { stage, detail };
  console.log(PREFIX, stage, payload);
}

export function logExtraDocFail(stage, error, detail = {}) {
  const err =
    error && typeof error === "object"
      ? {
          message: error.message || String(error),
          status: error.status ?? null,
          code: error.code ?? null,
          hint: error.hint ?? null,
          body: error.body ?? null,
        }
      : { message: String(error) };
  console.error(PREFIX, stage, { ...detail, error: err });
}

export function parseSupabaseErrorBody(text) {
  if (!text) return { message: "Error desconocido", raw: "" };
  try {
    const j = JSON.parse(text);
    return {
      message: j.message || j.error || j.hint || text,
      code: j.code || null,
      hint: j.hint || null,
      details: j.details || null,
      raw: text,
    };
  } catch {
    return { message: text, raw: text };
  }
}
