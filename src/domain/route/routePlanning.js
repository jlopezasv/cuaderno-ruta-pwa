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
  ["vitoria", "Vitoria", 42.8467, -2.6726],
  ["vigo", "Vigo", 42.2314, -8.7124],
  ["coruña", "A Coruña", 43.3623, -8.4115],
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

function localFind(q) {
  const nq = normC(q);
  for (const r of CITIES) {
    const nm = r[r.length - 3],
      la = r[r.length - 2],
      lo = r[r.length - 1];
    const ks = r.slice(0, r.length - 3).map((k) => normC(k));
    if (ks.some((k) => k === nq)) return { name: nm, lat: la, lon: lo };
    if (nq.length >= 3 && (ks.some((k) => k.startsWith(nq)) || normC(nm).startsWith(nq)))
      return { name: nm, lat: la, lon: lo };
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

const fetchTO = (url, ms = 7000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout")), ms);
    fetch(url)
      .then((r) => {
        clearTimeout(t);
        res(r);
      })
      .catch((e) => {
        clearTimeout(t);
        rej(e);
      });
  });

export async function geocode(q) {
  q = q.trim();
  if (!q) throw new Error("Escribe una ciudad");
  const l = localFind(q);
  if (l) return l;
  try {
    const r = await fetchTO(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=es`,
      6000,
    );
    if (r.ok) {
      const d = await r.json();
      if (d.features?.length) {
        const f = d.features[0],
          p = f.properties;
        return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: p.city || p.name || q };
      }
    }
  } catch (_) {}
  try {
    const r = await fetchTO(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=es`,
      6000,
    );
    if (r.ok) {
      const d = await r.json();
      if (d?.length) return { lat: +d[0].lat, lon: +d[0].lon, name: d[0].display_name.split(",")[0] };
    }
  } catch (_) {}
  throw new Error(`No encontrado: "${q}"`);
}

export async function revGeo(lat, lon) {
  try {
    const r = await fetchTO(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`, 4000);
    if (r.ok) {
      const d = await r.json();
      if (d.features?.length) {
        const p = d.features[0].properties;
        const n = p.city || p.town || p.village || p.name;
        if (n) return n;
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
  try {
    const r = await fetchTO(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`,
      8000,
    );
    if (r.ok) {
      const d = await r.json();
      if (d.code === "Ok" && d.routes?.length) {
        const rt = d.routes[0];
        const km = Math.round(rt.distance / 1000);
        const mins = Math.round((km / truckSpeed) * 60);
        return { km, mins, coords: rt.geometry.coordinates, real: true };
      }
    }
  } catch (_) {}
  const dist = haverDist(from.lat, from.lon, to.lat, to.lon);
  const fac = dist < 300 ? 1.45 : dist < 700 ? 1.35 : 1.28;
  const km = Math.round(dist * fac);
  const n = 50;
  return {
    km,
    mins: Math.round((km / truckSpeed) * 60),
    coords: Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return [from.lon + (to.lon - from.lon) * t, from.lat + (to.lat - from.lat) * t];
    }),
    real: false,
  };
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
