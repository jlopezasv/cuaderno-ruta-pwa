/**
 * Evita operaciones colgadas sin feedback (GPS, PATCH, sync operativo).
 */
export function withOperationTimeout(promise, ms = 45000, message = "La operación tardó demasiado. Inténtalo de nuevo.") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
