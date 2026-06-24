import { ACCOUNT_TYPES } from "../../auth/accountModel.js";

export const OFFICE_LINK_STATUS = Object.freeze({
  OK: "ok",
  INCOMPLETE: "incomplete",
});

export function isOfficeSatelliteProfile(profile, { isEmpresaOwner = false } = {}) {
  if (!profile || isEmpresaOwner) return false;
  const tipo = String(profile.tipo_cuenta || "").toLowerCase();
  return tipo === ACCOUNT_TYPES.EMPRESA;
}

export function evaluateOfficeUserLinkage({
  userId = null,
  email = null,
  profile = null,
  link = null,
  authExists = null,
  empresaId = null,
}) {
  const issues = [];
  if (!userId) issues.push("Falta user_id");
  if (authExists === false) issues.push("Sin usuario Auth");
  if (!profile) issues.push("Sin profile");
  else if (String(profile.tipo_cuenta || "").toLowerCase() !== ACCOUNT_TYPES.EMPRESA) {
    issues.push(`profile.tipo_cuenta=${profile.tipo_cuenta || "—"}`);
  }
  if (!link) issues.push("Sin fila empresa_usuarios");
  else if (empresaId && link.empresa_id && link.empresa_id !== empresaId) {
    issues.push("empresa_id no coincide");
  }

  const status = issues.length ? OFFICE_LINK_STATUS.INCOMPLETE : OFFICE_LINK_STATUS.OK;
  return {
    status,
    issues,
    userId: userId || link?.user_id || profile?.id || null,
    email: email || link?.email || profile?.email_empresa || null,
    profileTipoCuenta: profile?.tipo_cuenta || null,
    empresaId: link?.empresa_id || empresaId || null,
    rol: link?.rol || null,
    activo: link?.activo !== false,
    hasAuth: authExists !== false,
    hasProfile: !!profile,
    hasLink: !!link,
  };
}

export function officeLinkStatusLabel(status) {
  return status === OFFICE_LINK_STATUS.OK ? "Vinculación OK" : "Vinculación incompleta";
}
