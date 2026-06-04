import { isDemoApp } from "./appEnvironment.js";

/** Envío revisable de expediente por correo al cliente — solo proyecto demo (VITE_APP_ENV=demo). */
export function isClienteMailEnvioDemoEnabled() {
  return isDemoApp();
}

/** Demo: solo simulación; envío real (Resend) se activará más adelante. */
export function isClienteMailSoloSimulacion() {
  return isDemoApp();
}

export const CLIENTE_MAIL_SIMULACION_OK_MSG =
  "Simulación completada correctamente. No se ha enviado ningún correo real.";
