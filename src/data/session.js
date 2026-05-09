import { SB_URL, SB_KEY, sbFetch } from "./supabaseClient";

export { getSession, getUserId } from "./supabaseClient";

export async function signUp(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SB_KEY },
    body: JSON.stringify({ email, password }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || d.msg || "Error al registrarse");
  if (d.access_token) localStorage.setItem("sb_session", JSON.stringify(d));
  return d;
}

export async function signIn(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SB_KEY },
    body: JSON.stringify({ email, password }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || d.msg || "Email o contraseña incorrectos");
  // Limpiar datos del usuario anterior antes de cargar los nuevos
  const dark=localStorage.getItem("dark");
  const keysToRemove=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k!=="dark")keysToRemove.push(k);
  }
  keysToRemove.forEach(k=>localStorage.removeItem(k));
  if(dark)localStorage.setItem("dark",dark);
  localStorage.setItem("sb_session", JSON.stringify(d));
  return d;
}

export async function resetPassword(email) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset_password', admin_uid: 'public', email }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || 'Error al enviar email');
  return d;
}

export async function signOut() {
  await sbFetch("/auth/v1/logout", { method: "POST" }).catch(() => {});
  // Limpiar TODOS los datos del usuario del localStorage
  const keysToRemove = [];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&!["dark","sb_session"].includes(k))keysToRemove.push(k);
  }
  keysToRemove.forEach(k=>localStorage.removeItem(k));
  localStorage.removeItem("sb_session");
}

export async function refreshSession() {
  const session = JSON.parse(localStorage.getItem("sb_session") || "null");
  if (!session?.refresh_token) return null;
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SB_KEY },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const d = await res.json();
  if (d.access_token) { localStorage.setItem("sb_session", JSON.stringify(d)); return d; }
  return null;
}
