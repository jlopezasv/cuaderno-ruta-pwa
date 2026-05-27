/**
 * Motor compartido de ruta / plan normativo (EU).
 * Extraído de cuaderno-ruta.jsx para reutilización sin duplicar lógica.
 */

export const LIM = {
  CONT: 270,
  DAY: 540,
  DAY_X: 600,
  MAX_EXT: 2,
  WEEK: 3360,
  BIWEEK: 5400,
  REST: 660,
  REST_R: 540,
  MAX_RED: 3,
  WREST: 2700,
  WREST_R: 1440,
};

const CITIES = [
  ["almeria", "almería", "Almería", 36.8381, -2.4597],
  ["madrid", "Madrid", 40.4168, -3.7038],
  ["barcelona", "Barcelona", 41.3851, 2.1734],
  ["valencia", "Valencia", 39.4699, -0.3763],
  ["sevilla", "Sevilla", 37.3891, -5.9845],
  ["zaragoza", "Zaragoza", 41.6488, -0.8891],
  ["malaga", "málaga", "Málaga", 36.7213, -4.4214],
  ["bilbao", "Bilbao", 43.263, -2.935],
  ["sondika", "Sondika", 43.3002, -2.9244],
  ["burgos", "Burgos", 42.344, -3.697],
  ["santander", "Santander", 43.4623, -3.8099],
  ["pamplona", "Pamplona", 42.8169, -1.6432],
  ["irun", "irún", "Irún", 43.3396, -1.7887],
  ["la jonquera", "La Jonquera", 42.4199, 2.8878],
  ["algeciras", "Algeciras", 36.1408, -5.4558],
  ["girona", "Girona", 41.9794, 2.8214],
  ["lleida", "Lleida", 41.6176, 0.62],
  ["tarragona", "Tarragona", 41.1187, 1.2445],
  ["granada", "Granada", 37.1773, -3.5986],
  ["cordoba", "Córdoba", 37.8882, -4.7794],
  ["murcia", "Murcia", 37.9922, -1.1307],
  ["alicante", "Alacant", "Alicante", 38.3452, -0.481],
  ["castellon", "castellón", "Castellón", 39.9864, -0.0513],
  ["cadiz", "cádiz", "Cádiz", 36.5271, -6.2886],
  ["huelva", "Huelva", 37.2614, -6.9447],
  ["jaen", "jaén", "Jaén", 37.7796, -3.7849],
  ["toledo", "Toledo", 39.8628, -4.0273],
  ["valladolid", "Valladolid", 41.6523, -4.7245],
  ["leon", "león", "León", 42.5987, -5.5671],
  ["salamanca", "Salamanca", 40.9701, -5.6635],
  ["segovia", "Segovia", 40.9429, -4.1088],
  ["avila", "ávila", "Ávila", 40.6565, -4.6818],
  ["logrono", "logroño", "Logroño", 42.4627, -2.4449],
  ["vitoria", "Vitoria", 42.8467, -2.6726],
  ["san sebastian", "san sebastián", "donostia", "Donostia / San Sebastián", 43.3183, -1.9812],
  ["tolosa", "tolosa gipuzkoa", "tolosa guipuzcoa", "Tolosa", 43.1348, -2.0783],
  ["hernani", "Hernani", 43.2662, -1.9766],
  ["andoain", "Andoain", 43.2167, -2.0204],
  ["beasain", "Beasain", 43.0462, -2.1993],
  ["azkoitia", "Azkoitia", 43.1774, -2.3113],
  ["azpeitia", "Azpeitia", 43.1817, -2.2661],
  ["oviedo", "Oviedo", 43.3619, -5.8494],
  ["gijon", "gijón", "Gijón", 43.5322, -5.6611],
  ["vigo", "Vigo", 42.2314, -8.7124],
  ["coruña", "A Coruña", 43.3623, -8.4115],
  ["santiago", "santiago de compostela", "Santiago de Compostela", 42.8782, -8.5448],
  ["pontevedra", "Pontevedra", 42.431, -8.6444],
  ["ourense", "orense", "Ourense", 42.3358, -7.8639],
  ["lugo", "Lugo", 43.0097, -7.5568],
  ["badajoz", "Badajoz", 38.8794, -6.9707],
  ["caceres", "cáceres", "Cáceres", 39.4753, -6.3724],
  ["lisboa", "lisbon", "Lisboa", 38.7169, -9.1395],
  ["porto", "Porto", 41.1579, -8.6291],
  ["paris", "París", 48.8566, 2.3522],
  ["lyon", "Lyon", 45.764, 4.8357],
  ["marsella", "Marsella", 43.2965, 5.3698],
  ["toulouse", "Toulouse", 43.6047, 1.4442],
  ["calais", "Calais", 50.9513, 1.8587],
  ["perpignan", "Perpiñán", 42.6986, 2.8954],
  ["berlin", "Berlín", 52.52, 13.405],
  ["hamburgo", "hamburg", "Hamburgo", 53.5511, 9.9937],
  ["munich", "múnich", "Múnich", 48.1351, 11.582],
  ["frankfurt", "Frankfurt", 50.1109, 8.6821],
  ["colonia", "Colonia", 50.9333, 6.95],
  ["stuttgart", "Stuttgart", 48.7758, 9.1829],
  ["roma", "Roma", 41.9028, 12.4964],
  ["milan", "milán", "Milán", 45.4642, 9.19],
  ["amsterdam", "Ámsterdam", 52.3676, 4.9041],
  ["bruselas", "Bruselas", 50.8503, 4.3517],
  ["viena", "Viena", 48.2082, 16.3738],
  ["zurich", "Zúrich", 47.3769, 8.5417],
  ["praga", "Praga", 50.0755, 14.4378],
  ["varsovia", "Varsovia", 52.2297, 21.0122],
  ["budapest", "Budapest", 47.4979, 19.0402],
  ["estocolmo", "Estocolmo", 59.3293, 18.0686],
  ["oslo", "Oslo", 59.9139, 10.7522],
  ["copenhague", "Copenhague", 55.6761, 12.5683],
  ["londres", "london", "Londres", 51.5074, -0.1278],
  ["manchester", "Manchester", 53.4808, -2.2466],
];

const normC = (s) =>
  s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

function addressFallbackCandidates(q) {
  const candidates = [];
  const add = (value) => {
    const clean = String(value || "").trim();
    if (clean && normC(clean) !== normC(q) && !candidates.some((x) => normC(x) === normC(clean))) candidates.push(clean);
  };

  String(q || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(1)
    .reverse()
    .forEach(add);

  const words = String(q || "")
    .replace(/[^\wÀ-ÿ\s-]/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x && !/^\d+$/.test(x));
  for (let len = 1; len <= Math.min(3, words.length); len++) {
    add(words.slice(words.length - len).join(" "));
  }
  return candidates;
}

export function localFind(q) {
  const nq = normC(q);
  for (const r of CITIES) {
    const nm = r[r.length - 3],
      la = r[r.length - 2],
      lo = r[r.length - 1];
    const ks = r.slice(0, r.length - 3).map((k) => normC(k));
    if (ks.some((k) => k === nq) || normC(nm) === nq) return { name: nm, lat: la, lon: lo };
  }
  return null;
}

export function nearbyCity(lat, lon) {
  let b = null,
    d = Infinity;
  for (const r of CITIES) {
    const dd = Math.hypot(r[r.length - 2] - lat, r[r.length - 1] - lon);
    if (dd < d) {
      d = dd;
      b = r[r.length - 3];
    }
  }
  return b ? `Zona ${b}` : "Parada";
}

function routeLog(level, msg, data) {
  if (typeof console === "undefined") return;
  const fn = level === "warn" ? console.warn : console.info;
  fn(`[route-planning] ${msg}`, data ?? "");
}

function validCoord(lat, lon) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180;
}

function normalizePoint(point, label) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!validCoord(lat, lon)) {
    throw new Error(`Coordenadas invalidas para ${label}: lat=${point?.lat ?? "null"}, lon=${point?.lon ?? "null"}`);
  }
  return { ...point, lat, lon, name: point?.name || label };
}

const fetchTO = async (url, ms = 7000, init = {}) => {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    return await fetch(url, ctrl ? { ...init, signal: ctrl.signal } : init);
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`timeout ${ms}ms`);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export async function geocode(q) {
  q = q.trim();
  if (!q) throw new Error("Escribe una ciudad");
  const l = localFind(q);
  if (l) {
    routeLog("info", "geocode local ok", { q, result: l });
    return l;
  }

  const errors = [];
  const tryProvider = async (provider, url, parse, init = {}) => {
    routeLog("info", "geocode provider start", { q, provider });
    try {
      const r = await fetchTO(url, 7000, init);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const point = parse(d);
      if (!point) throw new Error("sin resultados");
      const normalized = normalizePoint(point, provider);
      routeLog("info", "geocode provider ok", { q, provider, result: normalized });
      return normalized;
    } catch (e) {
      const message = e?.message || String(e);
      errors.push(`${provider}: ${message}`);
      routeLog("warn", "geocode provider failed", { q, provider, error: message });
      return null;
    }
  };

  const openMeteo = await tryProvider(
    "open-meteo",
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=es&format=json`,
    (d) => {
      const rows = Array.isArray(d?.results) ? d.results : [];
      const r = rows.find((x) => validCoord(x?.latitude, x?.longitude));
      if (!r) return null;
      return { lat: r.latitude, lon: r.longitude, name: r.name || q };
    },
  );
  if (openMeteo) return openMeteo;

  const photon = await tryProvider(
    "photon",
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=es`,
    (d) => {
      const rows = Array.isArray(d?.features) ? d.features : [];
      const f = rows.find((x) => validCoord(x?.geometry?.coordinates?.[1], x?.geometry?.coordinates?.[0]));
      if (!f) return null;
      const p = f.properties || {};
      return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: p.city || p.town || p.village || p.name || q };
    },
  );
  if (photon) return photon;

  const nominatimHeaders = {
    Accept: "application/json",
    ...(typeof window === "undefined" ? { "User-Agent": "CuadernoRuta/1.0 operational-planning" } : {}),
  };
  const nominatim = await tryProvider(
    "nominatim",
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=es`,
    (d) => {
      const rows = Array.isArray(d) ? d : [];
      const r = rows.find((x) => validCoord(x?.lat, x?.lon));
      if (!r) return null;
      const display = r.display_name?.split(",")?.slice(0, 3)?.join(",")?.trim();
      const name = r.name && !/^\d+$/.test(String(r.name).trim()) ? r.name : display;
      return { lat: +r.lat, lon: +r.lon, name: name || q };
    },
    { headers: nominatimHeaders },
  );
  if (nominatim) return nominatim;

  for (const candidate of addressFallbackCandidates(q)) {
    try {
      routeLog("info", "geocode address fallback start", { q, candidate });
      const point = await geocode(candidate);
      const result = { ...point, name: q };
      routeLog("info", "geocode address fallback ok", { q, candidate, result });
      return result;
    } catch (e) {
      const message = e?.message || String(e);
      errors.push(`fallback ${candidate}: ${message}`);
      routeLog("warn", "geocode address fallback failed", { q, candidate, error: message });
    }
  }

  throw new Error(`No encontrado: "${q}". ${errors.join(" | ")}`);
}

export async function revGeo(lat, lon) {
  try {
    const r = await fetchTO(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`, 4000);
    if (r.ok) {
      const d = await r.json();
      if (d.features?.length) {
        const p = d.features[0].properties;
        const n = p.city || p.town || p.village || p.name;
        if (n) return [n, p.country].filter(Boolean).join(", ");
      }
    }
  } catch (_) {}
  return nearbyCity(lat, lon);
}

export function haverDist(la1, lo1, la2, lo2) {
  const R = 6371,
    dL = ((la2 - la1) * Math.PI) / 180,
    dN = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dL / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dN / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const TRUCK_KMH = 80;
export const AVG_KMH = 80;

export async function getRoute(from, to, truckSpeed = TRUCK_KMH) {
  const fromPoint = normalizePoint(from, "origen");
  const toPoint = normalizePoint(to, "destino");
  routeLog("info", "route request", { from: fromPoint, to: toPoint, truckSpeed });
  const path = `${fromPoint.lon},${fromPoint.lat};${toPoint.lon},${toPoint.lat}`;
  const providers = [
    ["osrm-project", `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`],
    ["osm-de", `https://routing.openstreetmap.de/routed-car/route/v1/driving/${path}?overview=full&geometries=geojson`],
  ];
  const errors = [];
  for (const [provider, url] of providers) {
    routeLog("info", "route provider start", { provider, from: fromPoint, to: toPoint });
    try {
      const r = await fetchTO(url, 9000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.code !== "Ok" || !d.routes?.length) throw new Error(`${d.code || "sin rutas"}`);
      const rt = d.routes[0];
      const rawCoords = rt.geometry?.coordinates;
      if (!Array.isArray(rawCoords) || rawCoords.length < 2) throw new Error("sin geometria");
      const km = Math.round(rt.distance / 1000);
      const mins = Math.round((km / truckSpeed) * 60);
      routeLog("info", "route provider ok", { provider, km, mins, coords: rawCoords.length });
      return { km, mins, coords: rawCoords, real: true, provider };
    } catch (e) {
      const message = e?.message || String(e);
      errors.push(`${provider}: ${message}`);
      routeLog("warn", "route provider failed", { provider, error: message, from: fromPoint, to: toPoint });
    }
  }
  throw new Error(`No se pudo calcular ruta real. ${errors.join(" | ")}`);
}

export const p2 = (n) => String(n).padStart(2, "0");

export const fmtT = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

export const fmtDur = (m) => {
  if (!m || m < 1) return "0m";
  const h = Math.floor(m / 60),
    r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
};

export function buildPlan(driveMins, norma, cfg = {}) {
  const { splitBreak = false, splitAt = 135, start = new Date(), contUsed, dayUsed, weekUsed, extUsed } = cfg;
  let rem = driveMins;
  let cont = contUsed != null ? contUsed : norma?.cont || 0;
  let day = dayUsed != null ? dayUsed : norma?.todayDrive || 0;
  let week = weekUsed != null ? weekUsed : norma?.weekDrive || 0;
  let ext = extUsed != null ? extUsed : norma?.extUsed || 0;
  let sp = norma?.sp || 0,
    drivenMin = 0;
  let t = new Date(start);
  const segs = [];
  const AVG_LOCAL = 80;
  const add = (type, dur) => {
    segs.push({ type, start: new Date(t), dur, km: Math.round((drivenMin / 60) * AVG_LOCAL) });
    t = new Date(+t + dur * 60000);
  };
  const PMAP = {
    conduccion: "🚛",
    pausa_45: "☕",
    pausa_15: "⏸",
    pausa_30: "☕",
    descanso: "🛏",
    descanso_semana: "🏨",
  };
  const PLBL = {
    conduccion: "Conducción",
    pausa_45: "Pausa 45 min",
    pausa_15: "Pausa 1ª — 15 min",
    pausa_30: "Pausa 2ª — 30 min",
    descanso: "Descanso 9h",
    descanso_semana: "Descanso semanal 45h",
  };
  const PCOL = {
    conduccion: "#F59E0B",
    pausa_45: "#6366F1",
    pausa_15: "#818CF8",
    pausa_30: "#6366F1",
    descanso: "#7C3AED",
    descanso_semana: "#9D174D",
  };
  for (let g = 0; g < 1200 && rem > 0; g++) {
    const canE = ext < LIM.MAX_EXT,
      maxD = canE ? LIM.DAY_X : LIM.DAY;
    const limC = splitBreak
      ? sp === 0
        ? Math.max(0, splitAt - cont)
        : Math.max(0, LIM.CONT - cont)
      : Math.max(0, LIM.CONT - cont);
    const limD = Math.max(0, maxD - day);
    const limW = Math.max(0, LIM.WEEK - week);
    const cd = Math.min(rem, limC, limD, limW);
    if (cd <= 0) {
      if (limW <= 0) {
        add("descanso_semana", LIM.WREST);
        week = 0;
        day = 0;
        cont = 0;
        ext = 0;
        sp = 0;
      } else if (limD <= 0) {
        add("descanso", LIM.REST_R);
        day = 0;
        cont = 0;
        sp = 0;
      } else if (splitBreak && sp === 0 && limC <= 0) {
        add("pausa_15", 15);
        sp = 1;
      } else if (limC <= 0) {
        add(splitBreak ? "pausa_30" : "pausa_45", splitBreak ? 30 : 45);
        cont = 0;
        sp = 0;
      }
      continue;
    }
    drivenMin += cd;
    add("conduccion", cd);
    cont += cd;
    day += cd;
    week += cd;
    rem -= cd;
    if (day > LIM.DAY && canE && ext < LIM.MAX_EXT) ext++;
    if (rem <= 0) break;
    const newMaxD = ext < LIM.MAX_EXT ? LIM.DAY_X : LIM.DAY;
    if (week >= LIM.WEEK) {
      add("descanso_semana", LIM.WREST);
      week = 0;
      day = 0;
      cont = 0;
      ext = 0;
      sp = 0;
    } else if (day >= newMaxD) {
      add("descanso", LIM.REST_R);
      day = 0;
      cont = 0;
      sp = 0;
    } else if (splitBreak && sp === 0 && cont >= splitAt) {
      add("pausa_15", 15);
      sp = 1;
    } else if (cont >= LIM.CONT) {
      add(splitBreak ? "pausa_30" : "pausa_45", splitBreak ? 30 : 45);
      cont = 0;
      sp = 0;
    }
  }
  const kmTotal = cfg.km || 0;
  const dias = [];

  if (kmTotal > 0) {
    const totalDriveMins = segs.filter((s) => s.type === "conduccion").reduce((a, s) => a + s.dur, 0) || 1;
    let kmAcum = 0;
    let diaNum = 1;
    let drivHoy = 0;
    let kmHoy = 0;

    for (const seg of segs) {
      if (seg.type === "conduccion") {
        const kmSeg = Math.round((seg.dur / totalDriveMins) * kmTotal);
        drivHoy += seg.dur;
        kmHoy += kmSeg;
      } else if (["descanso", "descanso_semana"].includes(seg.type)) {
        const kmDiaReal = Math.min(kmHoy, kmTotal - kmAcum);
        if (kmDiaReal > 0) {
          kmAcum += kmDiaReal;
          dias.push({
            dia: diaNum,
            conduccion: Math.round(drivHoy),
            km: kmDiaReal,
            kmAcum: Math.min(kmAcum, kmTotal),
            llegada: false,
          });
        }
        diaNum++;
        drivHoy = 0;
        kmHoy = 0;
      }
    }
    if (drivHoy > 0) {
      const kmUltimo = Math.max(0, kmTotal - kmAcum);
      if (kmUltimo > 0 || dias.length === 0) {
        dias.push({
          dia: diaNum,
          conduccion: Math.round(drivHoy),
          km: kmUltimo,
          kmAcum: kmTotal,
          llegada: true,
        });
      }
    }
  }

  if (kmTotal > 0 && dias.length === 0) {
    dias.push({ dia: 1, conduccion: driveMins, km: kmTotal, kmAcum: kmTotal, llegada: true });
  }

  const nDias = dias.length;
  const llegaHoy = nDias <= 1;

  return {
    segs,
    arrival: new Date(t),
    driveMins,
    restMins: segs.filter((s) => s.type !== "conduccion").reduce((a, s) => a + s.dur, 0),
    dias,
    nDias,
    llegaHoy,
    PMAP,
    PLBL,
    PCOL,
  };
}
