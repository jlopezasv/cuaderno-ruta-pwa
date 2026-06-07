import { ensureAuthAccessToken } from "../../data/supabaseClient.js";

async function authHeaders() {
  const token = await ensureAuthAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function postSuperadmin(body) {
  const res = await fetch("/api/superadmin", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export function fetchSuperadminDashboard() {
  return postSuperadmin({ action: "dashboard" });
}

export function fetchSuperadminEmpresas() {
  return postSuperadmin({ action: "list_empresas" });
}

export function fetchSuperadminEmpresaDetail(empresaId) {
  return postSuperadmin({ action: "empresa_detail", empresa_id: empresaId });
}

export function createSuperadminEmpresa(payload) {
  return postSuperadmin({ action: "create_empresa", ...payload });
}

export function toggleSuperadminEmpresa(empresaId, activa) {
  return postSuperadmin({ action: "toggle_empresa", empresa_id: empresaId, activa });
}

export function toggleSuperadminConductor(conductorEmpresaId, activo) {
  return postSuperadmin({
    action: "toggle_conductor",
    conductor_empresa_id: conductorEmpresaId,
    activo,
  });
}

export function toggleSuperadminOfficeUser(empresaUsuarioId, activo) {
  return postSuperadmin({
    action: "toggle_office_user",
    empresa_usuario_id: empresaUsuarioId,
    activo,
  });
}

export function resetSuperadminPassword(userId) {
  return postSuperadmin({ action: "reset_password", user_id: userId });
}
