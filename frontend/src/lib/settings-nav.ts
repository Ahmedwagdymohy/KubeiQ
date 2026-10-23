/** Settings areas. Each opens its own view at /settings#<id>. */
export const SETTINGS_AREAS = [
  { id: "ai", label: "AI Model", admin: true },
  { id: "clusters", label: "Clusters", admin: true },
  { id: "changes", label: "Cluster Changes", admin: true },
  { id: "users", label: "Users", admin: true },
  { id: "projects", label: "Projects", admin: true },
  { id: "activity", label: "Activity", admin: true },
  { id: "account", label: "Account", admin: false },
  { id: "about", label: "About", admin: true },
] as const;

export type SettingsArea = (typeof SETTINGS_AREAS)[number]["id"];

export function settingsAreas(admin: boolean) {
  return SETTINGS_AREAS.filter((a) => admin || !a.admin);
}

/** The area named by the URL hash, or the first one this user may open. */
export function areaFromHash(hash: string, admin: boolean): SettingsArea {
  const id = hash.replace(/^#/, "");
  const areas = settingsAreas(admin);
  return (areas.find((a) => a.id === id) ?? areas[0]).id;
}
