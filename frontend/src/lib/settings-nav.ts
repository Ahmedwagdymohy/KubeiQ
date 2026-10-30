/** Settings areas, grouped. Each opens its own view at /settings#<id>. */
export const SETTINGS_AREAS = [
  { id: "general", label: "General", admin: true, group: "Workspace" },
  { id: "appearance", label: "Appearance", admin: false, group: "Workspace" },
  { id: "clusters", label: "Clusters", admin: true, group: "Workspace" },
  { id: "projects", label: "Projects", admin: true, group: "Workspace" },
  { id: "account", label: "Account", admin: false, group: "People" },
  { id: "users", label: "Users", admin: true, group: "People" },
  { id: "signin", label: "Sign-In", admin: true, group: "People" },
  { id: "ai", label: "AI Model", admin: true, group: "Intelligence" },
  { id: "notifications", label: "Notifications", admin: true, group: "Operations" },
  { id: "changes", label: "Cluster Changes", admin: true, group: "Operations" },
  { id: "activity", label: "Activity", admin: true, group: "System" },
  { id: "license", label: "License", admin: true, group: "System" },
  { id: "about", label: "About", admin: true, group: "System" },
  { id: "danger", label: "Danger Zone", admin: true, group: "System" },
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
