import {
  listAllBlockChildren,
  queryAllDatabasePages,
  queryDatabase,
  retrieveDatabase,
} from "@/lib/notion";

const SCHEDULE_DB_ID = process.env.NOTION_SCHEDULE_DATABASE_ID!;

export type Slot = {
  id: string;
  label: string;
  timeRange: string;
  isMeal: boolean;
  order?: number;
};

export type ScheduleData = {
  people: string[];
  slots: Slot[];
  cells: string[][];
  reportFlags?: boolean[];
  scheduleDate?: string;
  reportTime?: string;
  taskResetTime?: string;
  message?: string;
};

export type ScheduleDatabaseEntry = {
  id: string;
  title: string;
  dateLabel: string;
  isStaging: boolean;
};

export type WeeklyScheduleData = {
  weekLabel: string;
  weekOverview: {
    columns: string[];
    rows: {
      day: string;
      assignments: Record<string, string[]>;
    }[];
  };
  weekendSchedule: {
    columns: string[];
    rows: {
      task: string;
      assignments: Record<string, string[]>;
    }[];
  };
};

function getPlainText(prop: any): string {
  if (!prop) return "";

  switch (prop.type) {
    case "title":
      return (prop.title || [])
        .map((t: any) => t.plain_text || "")
        .join("")
        .trim();
    case "rich_text":
      return (prop.rich_text || [])
        .map((t: any) => t.plain_text || "")
        .join("")
        .trim();
    case "select":
      return prop.select?.name || "";
    case "multi_select":
      return (prop.multi_select || [])
        .map((s: any) => s.name || "")
        .join(", ")
        .trim();
    default:
      return "";
  }
}

function parseSlotMeta(key: string) {
  const orderMatch = key.match(/^(\d+)\s*\|\s*(.+)$/);
  const order = orderMatch ? Number(orderMatch[1]) : Number.POSITIVE_INFINITY;
  const withoutOrder = (orderMatch ? orderMatch[2] : key).trim();

  const match = withoutOrder.match(/^(.+?)\s*\((.+)\)\s*$/);
  const label = (match ? match[1] : withoutOrder).trim();
  const timeRange = (match ? match[2] : "").trim();
  const isMeal = /breakfast|lunch|dinner/i.test(label);
  return { label, timeRange, isMeal, order };
}

function notionTitleToPlainText(title: any[] = []) {
  return title.map((t) => t.plain_text || "").join("").trim();
}

function getTitlePropertyKey(meta: any): string {
  const props = meta?.properties || {};
  for (const [key, value] of Object.entries(props)) {
    if ((value as any)?.type === "title") return key;
  }
  return "Name";
}

export function formatScheduleDateLabel(dateStr: string): string {
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return dateStr;
  const month = `${dt.getMonth() + 1}`.padStart(2, "0");
  const day = `${dt.getDate()}`.padStart(2, "0");
  const year = dt.getFullYear();
  return `${month}/${day}/${year}`;
}

function parseScheduleTitle(title: string): { dateLabel: string; isStaging: boolean } | null {
  const trimmed = (title || "").trim();
  if (!trimmed) return null;
  const stagingMatch = trimmed.match(/^staging\s*-\s*(.+)$/i);
  const rawDate = stagingMatch ? stagingMatch[1].trim() : trimmed;
  const formatted = formatScheduleDateLabel(rawDate);
  if (!formatted) return null;
  return { dateLabel: formatted, isStaging: Boolean(stagingMatch) };
}

function parseDateValue(dateLabel: string) {
  const parts = dateLabel.split("/").map((p) => Number(p));
  if (parts.length !== 3) return null;
  const [month, day, year] = parts;
  if (!month || !day || !year) return null;
  const dt = new Date(year, month - 1, day);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function scheduleTitleForDate(dateLabel: string, staging = false) {
  const formatted = formatScheduleDateLabel(dateLabel);
  return staging ? `Staging - ${formatted}` : formatted;
}

export function weeklyScheduleTitleForDate(dateLabel: string) {
  const formatted = formatScheduleDateLabel(dateLabel);
  return `${formatted} - Weekly`;
}

function parseNamesList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[\n,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function toMondayDateLabel(dateLabel: string): string {
  const dt = new Date(dateLabel);
  if (Number.isNaN(dt.getTime())) return dateLabel;
  const dayIndex = dt.getDay();
  const diffToMonday = (dayIndex + 6) % 7;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - diffToMonday);
  return formatScheduleDateLabel(monday.toLocaleDateString("en-US"));
}

export function buildDatabasePropertiesFromMeta(meta: any) {
  const properties: Record<string, any> = {};
  const source = meta?.properties || {};

  Object.entries(source).forEach(([name, prop]: [string, any]) => {
    const type = prop?.type;
    if (!type) return;
    const config = prop?.[type] ?? {};
    properties[name] = { [type]: config };
  });

  return properties;
}

function extractHawaiiTime(dateStr?: string): string {
  if (!dateStr) return "";
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Pacific/Honolulu",
  }).formatToParts(dt);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";

  if (!hour || !minute) return "";
  return `${hour}:${minute}`;
}

function normalizeTaskValue(task: string): string {
  const trimmed = task.trim();
  if (!trimmed) return "";
  const base = trimmed.split("\n")[0].trim();
  if (base === "-") return "";
  return trimmed;
}

export async function resolveScheduleDatabase(
  options: {
    dateLabel?: string;
    staging?: boolean;
  } = {}
) {
  const { dateLabel, staging = false } = options;

  try {
    const meta = await retrieveDatabase(SCHEDULE_DB_ID);
    return {
      databaseId: SCHEDULE_DB_ID,
      databaseMeta: meta,
      scheduleDate: dateLabel ? formatScheduleDateLabel(dateLabel) : undefined,
    };
  } catch (err) {
    console.warn("Schedule ID is not a database, attempting to read page children");
  }

  const children = await listAllBlockChildren(SCHEDULE_DB_ID);
  const childDatabases = (children.results || []).filter(
    (block: any) => block.type === "child_database"
  );

  const settingsDb = childDatabases.find(
    (db: any) =>
      (db.child_database?.title || "").trim().toLowerCase() === "settings"
  );

  if (!settingsDb) {
    throw new Error("Could not find Settings database under the schedule page");
  }

  const settingsMeta = await retrieveDatabase(settingsDb.id);
  const titleKey = getTitlePropertyKey(settingsMeta);
  const [settingsQuery, reportQuery, taskResetQuery] = await Promise.all([
    queryDatabase(settingsDb.id, {
      page_size: 1,
      filter: {
        property: titleKey,
        title: {
          equals: "Settings",
        },
      },
      sorts: [
        {
          property: "Selected Schedule",
          direction: "descending",
        },
      ],
    }),
    queryDatabase(settingsDb.id, {
      page_size: 1,
      filter: {
        property: titleKey,
        title: {
          equals: "Report Time",
        },
      },
      sorts: [
        {
          property: "Selected Schedule",
          direction: "descending",
        },
      ],
    }),
    queryDatabase(settingsDb.id, {
      page_size: 1,
      filter: {
        property: titleKey,
        title: {
          equals: "Task Reset Time",
        },
      },
      sorts: [
        {
          property: "Selected Schedule",
          direction: "descending",
        },
      ],
    }),
  ]);

  const settingsRow = settingsQuery.results?.[0];
  const selectedDate = settingsRow?.properties?.["Selected Schedule"]?.date?.start;

  const reportRow = reportQuery.results?.[0];
  const reportTimeValue = extractHawaiiTime(
    reportRow?.properties?.["Selected Schedule"]?.date?.start || ""
  );

  const taskResetRow = taskResetQuery.results?.[0];
  const taskResetTime = extractHawaiiTime(
    taskResetRow?.properties?.["Selected Schedule"]?.date?.start || ""
  );

  const scheduleDate = dateLabel
    ? formatScheduleDateLabel(dateLabel)
    : selectedDate
      ? formatScheduleDateLabel(selectedDate)
      : "";

  if (!scheduleDate) {
    throw new Error("Selected Schedule date is not configured in Notion");
  }

  const expectedTitle = staging ? `Staging - ${scheduleDate}` : scheduleDate;

  const targetDb = childDatabases.find(
    (db: any) => (db.child_database?.title || "").trim() === expectedTitle
  );

  if (!targetDb) {
    throw new Error(`No schedule database found for ${expectedTitle}`);
  }

  const databaseMeta = await retrieveDatabase(targetDb.id);
  return {
    databaseId: targetDb.id,
    databaseMeta,
    scheduleDate,
    reportTime: reportTimeValue,
    taskResetTime,
  };
}

export async function listScheduleDatabases(): Promise<{
  mode: "database" | "page";
  schedules: ScheduleDatabaseEntry[];
  settingsDatabaseId?: string;
}> {
  try {
    await retrieveDatabase(SCHEDULE_DB_ID);
    return { mode: "database", schedules: [] };
  } catch (err) {
    console.warn("Schedule ID is not a database, listing page children");
  }

  const children = await listAllBlockChildren(SCHEDULE_DB_ID);
  const childDatabases = (children.results || []).filter(
    (block: any) => block.type === "child_database"
  );

  const settingsDb = childDatabases.find(
    (db: any) =>
      (db.child_database?.title || "").trim().toLowerCase() === "settings"
  );

  const schedules = childDatabases
    .map((db: any) => {
      const title = (db.child_database?.title || "").trim();
      if (!title || title.toLowerCase() === "settings") return null;
      const parsed = parseScheduleTitle(title);
      if (!parsed) return null;
      return {
        id: db.id,
        title,
        dateLabel: parsed.dateLabel,
        isStaging: parsed.isStaging,
      } as ScheduleDatabaseEntry;
    })
    .filter(Boolean) as ScheduleDatabaseEntry[];

  schedules.sort((a, b) => {
    const aDate = parseDateValue(a.dateLabel);
    const bDate = parseDateValue(b.dateLabel);
    if (aDate && bDate) return aDate.getTime() - bDate.getTime();
    return a.dateLabel.localeCompare(b.dateLabel);
  });

  return {
    mode: "page",
    schedules,
    settingsDatabaseId: settingsDb?.id,
  };
}

export async function loadScheduleData(
  options: { dateLabel?: string; staging?: boolean } = {}
): Promise<ScheduleData> {
  if (!SCHEDULE_DB_ID) {
    throw new Error("NOTION_SCHEDULE_DATABASE_ID is not set");
  }

  try {
    const resolution = await resolveScheduleDatabase(options);
    const data = await queryAllDatabasePages(resolution.databaseId);
    const pages = data.results || [];

    if (pages.length === 0) {
      return {
        people: [],
        slots: [],
        cells: [],
        scheduleDate: resolution.scheduleDate,
      };
    }

    let slotKeys: string[] = [];

    try {
      const dbMeta =
        resolution.databaseMeta || (await retrieveDatabase(resolution.databaseId));
      const metaProps = dbMeta?.properties || {};
      slotKeys = Object.keys(metaProps).filter(
        (key) => key !== "Person" && key !== "Report"
      );
      if (!resolution.scheduleDate && dbMeta?.title) {
        resolution.scheduleDate = notionTitleToPlainText(dbMeta.title);
      }
    } catch (metaErr) {
      console.error(
        "Failed to retrieve database metadata, falling back to first row:",
        metaErr
      );
      const firstProps = pages[0].properties || {};
      slotKeys = Object.keys(firstProps).filter(
        (key) => key !== "Person" && key !== "Report"
      );
    }

    const slotEntries = slotKeys.map((key) => {
      const meta = parseSlotMeta(key);
      return {
        key,
        ...meta,
      };
    });

    slotEntries.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });

    const orderedKeys = slotEntries.map((s) => s.key);
    const slots: Slot[] = slotEntries.map((entry) => ({
      id: entry.key,
      label: entry.label,
      timeRange: entry.timeRange,
      isMeal: entry.isMeal,
    }));

    const people: string[] = [];
    const cells: string[][] = [];
    const reportFlags: boolean[] = [];

    for (const page of pages) {
      const personName = getPlainText(page.properties?.["Person"]);
      if (!personName) continue;

      people.push(personName);

      const rowTasks: string[] = [];
      const reportFlag = Boolean(page.properties?.["Report"]?.checkbox);

      for (const key of orderedKeys) {
        const prop = page.properties?.[key];
        const task = normalizeTaskValue(getPlainText(prop));
        rowTasks.push(task || "");
      }

      cells.push(rowTasks);
      reportFlags.push(reportFlag);
    }

    return {
      people,
      slots,
      cells,
      reportFlags,
      scheduleDate: resolution.scheduleDate,
      reportTime: resolution.reportTime,
      taskResetTime: resolution.taskResetTime,
    };
  } catch (err) {
    const friendly = "No schedule has been assigned yet.";
    console.error("Failed to fetch schedule from Notion:", err);
    return {
      people: [],
      slots: [],
      cells: [],
      message: friendly,
    };
  }
}

export async function loadWeeklyScheduleData(
  options: { dateLabel?: string } = {}
): Promise<WeeklyScheduleData> {
  if (!SCHEDULE_DB_ID) {
    throw new Error("NOTION_SCHEDULE_DATABASE_ID is not set");
  }

  const children = await listAllBlockChildren(SCHEDULE_DB_ID);
  const childDatabases = (children.results || []).filter(
    (block: any) => block.type === "child_database"
  );

  const settingsDb = childDatabases.find(
    (db: any) =>
      (db.child_database?.title || "").trim().toLowerCase() === "settings"
  );

  if (!settingsDb) {
    throw new Error("Could not find Settings database under the schedule page");
  }

  const settingsMeta = await retrieveDatabase(settingsDb.id);
  const titleKey = getTitlePropertyKey(settingsMeta);
  const settingsQuery = await queryDatabase(settingsDb.id, {
    page_size: 1,
    filter: {
      property: titleKey,
      title: {
        equals: "Settings",
      },
    },
    sorts: [
      {
        property: "Selected Schedule",
        direction: "descending",
      },
    ],
  });

  const settingsRow = settingsQuery.results?.[0];
  const selectedDate = settingsRow?.properties?.["Selected Schedule"]?.date?.start;

  const baseDate = options.dateLabel
    ? formatScheduleDateLabel(options.dateLabel)
    : selectedDate
      ? formatScheduleDateLabel(selectedDate)
      : "";

  if (!baseDate) {
    throw new Error("Selected Schedule date is not configured in Notion");
  }

  const mondayLabel = toMondayDateLabel(baseDate);
  const expectedTitle = weeklyScheduleTitleForDate(mondayLabel);

  const targetDb = childDatabases.find(
    (db: any) => (db.child_database?.title || "").trim() === expectedTitle
  );

  if (!targetDb) {
    throw new Error(`No weekly schedule database found for ${expectedTitle}`);
  }

  const databaseMeta = await retrieveDatabase(targetDb.id);
  const titlePropKey = getTitlePropertyKey(databaseMeta);
  const metaProps = databaseMeta?.properties || {};
  const columnKeys = Object.keys(metaProps).filter(
    (key) => key !== titlePropKey
  );

  const weekOverviewColumns = columnKeys.filter(
    (key) => !/weekend/i.test(key)
  );

  const weekendColumnOrder = [
    "Saturday AM",
    "Saturday PM",
    "Sunday AM",
    "Sunday PM",
  ];
  const weekendColumnKeys = weekendColumnOrder
    .map((label) => {
      const keyMatch = columnKeys.find(
        (key) => key.toLowerCase() === label.toLowerCase()
      );
      return keyMatch ? { label, key: keyMatch } : null;
    })
    .filter(Boolean) as { label: string; key: string }[];

  const data = await queryAllDatabasePages(targetDb.id);
  const pages = data.results || [];

  const dayOrder = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const daySet = new Set(dayOrder.map((day) => day.toLowerCase()));

  const weekRows: WeeklyScheduleData["weekOverview"]["rows"] = [];
  const weekendRows: WeeklyScheduleData["weekendSchedule"]["rows"] = [];

  pages.forEach((page: any) => {
    const rowName = getPlainText(page.properties?.[titlePropKey]).trim();
    if (!rowName) return;

    if (daySet.has(rowName.toLowerCase())) {
      const assignments: Record<string, string[]> = {};
      weekOverviewColumns.forEach((column) => {
        const value = getPlainText(page.properties?.[column]);
        assignments[column] = parseNamesList(value);
      });
      weekRows.push({ day: rowName, assignments });
      return;
    }

    const weekendAssignments: Record<string, string[]> = {};
    weekendColumnKeys.forEach(({ key, label }) => {
      const value = getPlainText(page.properties?.[key]);
      weekendAssignments[label] = parseNamesList(value);
    });
    weekendRows.push({ task: rowName, assignments: weekendAssignments });
  });

  weekRows.sort(
    (a, b) =>
      dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
  );

  return {
    weekLabel: mondayLabel,
    weekOverview: {
      columns: weekOverviewColumns,
      rows: weekRows,
    },
    weekendSchedule: {
      columns: weekendColumnKeys.map((col) => col.label),
      rows: weekendRows,
    },
  };
}
