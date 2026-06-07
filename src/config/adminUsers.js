const DEFAULT_ADMIN_UIDS = "4b63a6e5-2e02-44e7-af61-b169583f40f5";

export function getAdminPanelUserIds() {
  const raw = (import.meta.env.VITE_ADMIN_PANEL_USER_IDS || DEFAULT_ADMIN_UIDS).trim();
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isPlatformAdminUid(uid) {
  return !!uid && getAdminPanelUserIds().includes(uid);
}
