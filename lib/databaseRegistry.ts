export type DatabaseRegistryItem = {
  name: string;
  envVar: string;
  purpose: string;
  endpoints?: string[];
  surfaces?: string[];
};

export const DATABASE_REGISTRY: DatabaseRegistryItem[] = [
  {
    name: "Users",
    envVar: "NOTION_USERS_DATABASE_ID",
    purpose: "Accounts, roles, heartbeat, and goat-arcade stats for everyone logging into the hub.",
    endpoints: ["/api/login", "/api/users", "/api/online", "/api/heartbeat", "/api/goat-stats", "/api/user-settings"],
    surfaces: ["/hub", "/hub/dashboard", "/hub/settings", "/hub/goat"],
  },
  {
    name: "Schedule",
    envVar: "NOTION_SCHEDULE_DATABASE_ID",
    purpose: "Daily shift grid for volunteers and admins, including cell tasks and notes.",
    endpoints: ["/api/schedule"],
    surfaces: ["/hub", "/hub/admin/schedule"],
  },
  {
    name: "Tasks",
    envVar: "NOTION_TASKS_DATABASE_ID",
    purpose: "Task catalog with descriptions, categories, statuses, and recurring resets.",
    endpoints: ["/api/task", "/api/task-types", "/api/tasks/reset-recurring", "/api/reports"],
    surfaces: ["/hub/admin/schedule"],
  },
  {
    name: "Requests",
    envVar: "NOTION_REQUESTS_DATABASE_ID",
    purpose: "Volunteer and admin requests, options, and status tracking.",
    endpoints: ["/api/request", "/api/request/options"],
    surfaces: ["/hub/request"],
  },
  {
    name: "Reports",
    envVar: "NOTION_REPORTS_DATABASE_ID",
    purpose: "Auto-generated daily reports composed from schedule and task data.",
    endpoints: ["/api/reports"],
    surfaces: ["/hub/admin/schedule"],
  },
  {
    name: "Animals",
    envVar: "NOTION_ANIMALS_DATABASE_ID",
    purpose: "Animalpedia entries and related guide data for the farm.",
    endpoints: ["/api/animals"],
    surfaces: ["/hub/guides/animalpedia"],
  },
  {
    name: "Guides Root Page",
    envVar: "NOTION_GUIDES_ROOT_PAGE_ID",
    purpose: "Parent page for how-to guides tree; used for listing and rendering guides.",
    endpoints: ["/api/guides"],
    surfaces: ["/hub/guides/how-to", "/hub/guides/farm-map"],
  },
];

export const HUB_REFERENCE_LINKS = [
  { label: "Work Dashboard", href: "/hub/dashboard", description: "Hub overview and quick links." },
  { label: "Volunteer Schedule", href: "/hub", description: "Daily schedule board for volunteers." },
  { label: "Admin Schedule", href: "/hub/admin/schedule", description: "Full admin editor with drag-and-drop tasks." },
  { label: "Requests", href: "/hub/request", description: "Volunteer requests and approvals." },
  { label: "How-To Guides", href: "/hub/guides/how-to", description: "Library of walkthroughs and tutorials." },
  { label: "Farm Map", href: "/hub/guides/farm-map", description: "Interactive map for the farm grounds." },
  { label: "Animalpedia", href: "/hub/guides/animalpedia", description: "Reference for animals and care details." },
];
