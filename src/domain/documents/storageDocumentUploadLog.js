/** Logs temporales — solo Storage. Filtrar consola: DOCUMENT_STORAGE_ */

const PREFIX = "[DOCUMENT_STORAGE]";

export function logStorageDoc(stage, detail = {}) {
  const payload =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? { stage, ...detail }
      : { stage, detail };
  console.log(PREFIX, stage, payload);
}

export function logStorageDocFail(stage, error, detail = {}) {
  const err =
    error && typeof error === "object"
      ? {
          message: error.message || String(error),
          status: error.status ?? null,
          code: error.code ?? null,
        }
      : { message: String(error) };
  console.error(PREFIX, stage, { ...detail, error: err });
}

export function isHttpStorageUrl(url) {
  if (url == null || url === "") return false;
  const s = String(url).trim();
  return s.startsWith("http://") || s.startsWith("https://");
}
