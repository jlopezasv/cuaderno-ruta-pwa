import { getAdminPanelUserIds } from "./adminUsers.js";

export const SUPERADMIN_EMAIL = (
  import.meta.env.VITE_SUPERADMIN_EMAIL || "jlopezasv@gmail.com"
).trim().toLowerCase();

export function isSuperadminUser(uid, email) {
  if (!uid || !getAdminPanelUserIds().includes(uid)) return false;
  return String(email || "").trim().toLowerCase() === SUPERADMIN_EMAIL;
}
