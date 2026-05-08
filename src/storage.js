/**
 * Adaptador de almacenamiento para producción.
 * Reemplaza window.storage (solo disponible en el artifact de Claude)
 * por localStorage para uso en el navegador real.
 *
 * NOTA: shared=true usa el mismo localStorage local.
 * Para datos comunitarios reales (mapa de parkings entre usuarios),
 * migrar a Supabase en el siguiente paso del roadmap.
 */

const storage = {
  /**
   * Obtiene un valor por clave.
   * @param {string} key
   * @param {boolean} shared - ignorado en localStorage, reservado para Supabase
   * @returns {Promise<{key, value}|null>}
   */
  get: async (key, shared = false) => {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return null;
      return { key, value, shared };
    } catch (_) {
      return null;
    }
  },

  /**
   * Guarda un valor.
   * @param {string} key
   * @param {string} value
   * @param {boolean} shared
   * @returns {Promise<{key, value}|null>}
   */
  set: async (key, value, shared = false) => {
    try {
      localStorage.setItem(key, value);
      return { key, value, shared };
    } catch (_) {
      return null;
    }
  },

  /**
   * Elimina una clave.
   * @param {string} key
   * @param {boolean} shared
   */
  delete: async (key, shared = false) => {
    try {
      localStorage.removeItem(key);
      return { key, deleted: true, shared };
    } catch (_) {
      return null;
    }
  },

  /**
   * Lista claves con un prefijo dado.
   * @param {string} prefix
   * @param {boolean} shared
   * @returns {Promise<{keys: string[]}>}
   */
  list: async (prefix = '', shared = false) => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      return { keys, prefix, shared };
    } catch (_) {
      return { keys: [] };
    }
  },
};

// Exponer globalmente para compatibilidad con el componente
window.storage = storage;

export default storage;
