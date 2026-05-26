const DEFAULT_ADMIN_UIDS = "ca5dd314-2e37-4f08-86d7-09103cb8e510";

export function getAdminPanelUserIds() {
  const raw = (import.meta.env.VITE_ADMIN_PANEL_USER_IDS || DEFAULT_ADMIN_UIDS).trim();
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isPlatformAdminUid(uid) {
  return !!uid && getAdminPanelUserIds().includes(uid);
}
