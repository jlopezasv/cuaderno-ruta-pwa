import { localFind } from "../route/routePlanning.js";

/** Países europeos habituales (código ISO + slug Zippopotam). */
export const EU_COUNTRY_OPTIONS = [
  { code: "ES", label: "España", zippo: "es", default: true },
  { code: "DE", label: "Alemania", zippo: "de" },
  { code: "FR", label: "Francia", zippo: "fr" },
  { code: "PT", label: "Portugal", zippo: "pt" },
  { code: "IT", label: "Italia", zippo: "it" },
  { code: "BE", label: "Bélgica", zippo: "be" },
  { code: "NL", label: "Países Bajos", zippo: "nl" },
  { code: "PL", label: "Polonia", zippo: "pl" },
  { code: "AT", label: "Austria", zippo: "at" },
  { code: "CH", label: "Suiza", zippo: "ch" },
  { code: "GB", label: "Reino Unido", zippo: "gb" },
];

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

export function resolveCountryZippoSlug(pais) {
  const p = norm(pais);
  if (!p) return "es";
  const hit = EU_COUNTRY_OPTIONS.find(
    (c) => norm(c.label) === p || norm(c.code) === p || norm(c.label).startsWith(p) || p.startsWith(norm(c.label)),
  );
  if (hit) return hit.zippo;
  if (/spain|espana|españa/.test(p)) return "es";
  if (/germany|alemania|deutschland/.test(p)) return "de";
  if (/france|francia/.test(p)) return "fr";
  return null;
}

export function defaultStopCountry() {
  return EU_COUNTRY_OPTIONS.find((c) => c.default)?.label || "España";
}

/** Catálogo local (demo / sin red). */
const LOCAL_POSTAL = {
  "es:04700": {
    ciudad: "El Ejido",
    provincia: "Almería",
    pais: "España",
    lat: 36.7763,
    lon: -2.8144,
  },
  "de:33602": {
    ciudad: "Bielefeld",
    provincia: "Nordrhein-Westfalen",
    pais: "Alemania",
    lat: 52.0302,
    lon: 8.5325,
  },
};

/** Resolución síncrona (catálogo demo / mapa sin red). */
export function lookupPostalCodeLocal(pais, cp) {
  return localPostalLookup(pais, cp);
}

function localPostalLookup(pais, cp) {
  const slug = resolveCountryZippoSlug(pais);
  const postal = String(cp || "").trim().replace(/\s+/g, "");
  if (!slug || !postal) return null;
  const key = `${slug}:${postal}`;
  const hit = LOCAL_POSTAL[key];
  if (!hit) return null;
  return { ...hit, source: "local_catalog", confidence: "high" };
}

function coordsFromCityName(ciudad, pais) {
  const hit = localFind(ciudad);
  if (!hit) return { lat: null, lon: null };
  return { lat: hit.lat, lon: hit.lon };
}

/**
 * Resuelve ciudad/provincia/coords a partir de país + CP.
 * @returns {Promise<{ ciudad, provincia, pais, lat, lon, source, confidence }|null>}
 */
export async function lookupPostalCode({ pais, codigoPostal }) {
  const postal = String(codigoPostal || "").trim().replace(/\s+/g, "");
  if (!postal || postal.length < 4) return null;

  const local = localPostalLookup(pais, postal);
  if (local) return local;

  const slug = resolveCountryZippoSlug(pais);
  if (!slug) return null;

  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;
    const res = await fetch(`https://api.zippopotam.us/${slug}/${encodeURIComponent(postal)}`, {
      signal: ctrl?.signal,
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    if (!place) return null;
    const ciudad = String(place["place name"] || place.place_name || "").trim();
    const provincia = String(place["state"] || place.state || "").trim();
    const countryLabel =
      EU_COUNTRY_OPTIONS.find((c) => c.zippo === slug)?.label || String(data?.country || pais || "").trim();
    const coords = coordsFromCityName(ciudad, countryLabel);
    return {
      ciudad,
      provincia,
      pais: countryLabel || pais,
      lat: coords.lat,
      lon: coords.lon,
      source: "zippopotam",
      confidence: ciudad ? "high" : "medium",
    };
  } catch {
    return null;
  }
}
