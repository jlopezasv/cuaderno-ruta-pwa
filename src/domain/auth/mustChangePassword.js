import { sbFetch } from "../../data/supabaseClient.js";

export function profileMustChangePassword(profile) {
  return profile?.must_change_password === true;
}

export async function clearMustChangePasswordProfile(userId) {
  if (!userId) throw new Error("Usuario no identificado");
  const res = await sbFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ must_change_password: false }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `No se pudo actualizar el perfil (${res.status})`);
  }
}
