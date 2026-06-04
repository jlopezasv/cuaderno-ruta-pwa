/**
 * Envío revisable de expediente por correo al cliente (demo y producción).
 * Sin RESEND_API_KEY en servidor: simulación (estado Simulado, sin email real).
 */

export function isClienteMailEnvioEnabled() {
  return true;
}

/** Alias histórico — ya no limita a demo. */
export function isClienteMailEnvioDemoEnabled() {
  return isClienteMailEnvioEnabled();
}

/**
 * En cliente no se conoce la API key; el servidor decide simulación vs Resend.
 * La UI puede asumir simulación hasta activar envío real.
 */
export function isClienteMailSoloSimulacion() {
  return true;
}

export const CLIENTE_MAIL_SIMULACION_OK_MSG =
  "Simulación completada correctamente. No se ha enviado ningún correo real.";
