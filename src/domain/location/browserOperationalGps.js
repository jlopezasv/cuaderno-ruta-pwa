/** Lectura puntual de GPS del navegador (operativa / recálculo de ruta). */
export function getBrowserOperationalGps() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, enableHighAccuracy: false, maximumAge: 300000 },
    );
  });
}
