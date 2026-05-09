const DB_KEY = "cuaderno_v7";
const PROF_KEY = "cuaderno_prof_v1";

// Migración: intentar cargar desde claves anteriores si v7 está vacío
const OLD_KEYS = ["cuaderno_v6", "cuaderno_v5", "cuaderno_v4", "cuaderno_v3", "cuaderno_v2", "cuaderno_v1", "cuaderno_db"];

export const loadLocalDb = async () => {
  try {
    const r = localStorage.getItem(DB_KEY);
    if (r) {
      const d = JSON.parse(r);
      if (d.entries?.length > 0) return d;
    }
    // Intentar migrar desde clave anterior
    for (const oldKey of OLD_KEYS) {
      try {
        const old = localStorage.getItem(oldKey);
        if (old) {
          const d = JSON.parse(old);
          if (d.entries?.length > 0) {
            localStorage.setItem(DB_KEY, old);
            return d;
          }
        }
      } catch (_) {}
    }
    return { entries: [], docs: [] };
  } catch (_) {
    return { entries: [], docs: [] };
  }
};

export const saveLocalDb = async (d) => {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(d));
  } catch (_) {}
};

export const loadLocalProfile = async () => {
  try {
    const r = localStorage.getItem(PROF_KEY);
    return r ? JSON.parse(r) : {};
  } catch (_) {
    return {};
  }
};

export const saveLocalProfile = async (p) => {
  try {
    localStorage.setItem(PROF_KEY, JSON.stringify(p));
  } catch (_) {}
};

export const mergeRemoteWithLocalToday = ({ remoteEntries, remoteDocs, localEntries, toDate }) => {
  const sbIds = new Set(remoteEntries.map((e) => String(e.id)));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const localHoy = localEntries.filter((e) => toDate(e.ts) >= hoy && !sbIds.has(String(e.id)));
  // Normalize all ts to Date
  const norm = (e) => ({ ...e, ts: toDate(e.ts) });
  return { entries: [...remoteEntries, ...localHoy].map(norm), docs: remoteDocs.map(norm) };
};
