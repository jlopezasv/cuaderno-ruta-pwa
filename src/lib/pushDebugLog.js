/** Logs push — visibles en producción si VITE_PUSH_DEBUG=1; siempre en DEV. */

export function isPushDebugEnabled() {
  return import.meta.env.DEV || import.meta.env.VITE_PUSH_DEBUG === "1";
}

export function pushDebugLog(...args) {
  if (isPushDebugEnabled()) console.log("[push]", ...args);
}

export function pushDebugWarn(...args) {
  console.warn("[push]", ...args);
}

export function pushDebugInfo(...args) {
  if (isPushDebugEnabled()) console.info("[push]", ...args);
}
