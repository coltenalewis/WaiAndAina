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

function formatScheduleDate(dateStr: string): string {
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return dateStr;
  const month = `${dt.getMonth() + 1}`.padStart(2, "0");
  const day = `${dt.getDate()}`.padStart(2, "0");
  const year = dt.getFullYear();
  return `${month}/${day}/${year}`;
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

export async function resolveScheduleDatabase() {
  try {
    const meta = await retrieveDatabase(SCHEDULE_DB_ID);
    return { databaseId: SCHEDULE_DB_ID, databaseMeta: meta };
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
    }),
    queryDatabase(settingsDb.id, {
      page_size: 1,
      filter: {
        property: titleKey,
        title: {
          equals: "Report Time",
        },
      },
    }),
    queryDatabase(settingsDb.id, {
      page_size: 1,
      filter: {
        property: titleKey,
        title: {
          equals: "Task Reset Time",
        },
      },
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

  if (!selectedDate) {
    throw new Error("Selected Schedule date is not configured in Notion");
  }

  const formattedDate = formatScheduleDate(selectedDate);

  const targetDb = childDatabases.find(
    (db: any) => (db.child_database?.title || "").trim() === formattedDate
  );

  if (!targetDb) {
    throw new Error(`No schedule database found for ${formattedDate}`);
  }

  const databaseMeta = await retrieveDatabase(targetDb.id);
  return {
    databaseId: targetDb.id,
    databaseMeta,
    scheduleDate: formattedDate,
    reportTime: reportTimeValue,
    taskResetTime,
  };
}

export async function loadScheduleData(): Promise<ScheduleData> {
  if (!SCHEDULE_DB_ID) {
    throw new Error("NOTION_SCHEDULE_DATABASE_ID is not set");
  }

  try {
    const resolution = await resolveScheduleDatabase();
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
