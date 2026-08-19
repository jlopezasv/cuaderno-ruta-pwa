export const BOOTSTRAP_ERRORS = Object.freeze({
  NO_PROFILE: "NO_PROFILE",
  NO_EMPRESA_SHELL: "NO_EMPRESA_SHELL",
  OFFICE_INACTIVE: "OFFICE_INACTIVE",
  OFFICE_LINK_BROKEN: "OFFICE_LINK_BROKEN",
});

/**
 * Distingue alta de empresa (sin empresas ni empresa_usuarios) de oficina mal vinculada.
 * Alta nueva: sin officeUser, sin owner y lectura de vínculo vacía → acceso válido.
 * Oficina: fila inactiva, o fila sin empresa_id.
 */
export function resolveOfficeAccessBootstrapError({
  hasProfile,
  officeUser = null,
  accountType = null,
  canDrive = false,
  isEmpresaOwner = false,
  linkState = null,
} = {}) {
  if (!hasProfile) return BOOTSTRAP_ERRORS.NO_PROFILE;
  if (officeUser && officeUser.activo === false) return BOOTSTRAP_ERRORS.OFFICE_INACTIVE;
  if (officeUser?.empresaId) return null;
  if (accountType !== "empresa" || canDrive || isEmpresaOwner) return null;

  const status = linkState?.status || null;
  const row = linkState?.row || null;
  if (status === "ok" && row?.activo === false) return BOOTSTRAP_ERRORS.OFFICE_INACTIVE;
  if (status === "ok" && row && !row.empresa_id) return BOOTSTRAP_ERRORS.OFFICE_LINK_BROKEN;
  return null;
}
