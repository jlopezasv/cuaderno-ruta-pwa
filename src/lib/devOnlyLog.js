/** Logs de desarrollo — no-op en build de producción (import.meta.env.DEV === false). */

export function devLog(...args) {
  if (import.meta.env.DEV) console.log(...args);
}

export function devWarn(...args) {
  if (import.meta.env.DEV) console.warn(...args);
}

export function devInfo(...args) {
  if (import.meta.env.DEV) console.info(...args);
}
