import { isDemoApp } from "../config/appEnvironment.js";

/** Desarrollo demo: sin bloqueos de registro/perfil/empresa en cliente (salvo demoSafety → prod). */
export function isDemoDevUnlocked() {
  return isDemoApp();
}

export function demoDevLog(...args) {
  if (isDemoDevUnlocked()) console.info("[demo-dev]", ...args);
}

export function demoDevWarn(...args) {
  if (isDemoDevUnlocked()) console.warn("[demo-dev]", ...args);
}

export function demoDevError(...args) {
  if (isDemoDevUnlocked()) console.error("[demo-dev]", ...args);
}
