// src/app/api/schedule/route.ts
import { NextResponse } from "next/server";
import {
  queryAllDatabasePages,
  queryDatabase,
  retrieveDatabase,
  listAllBlockChildren,
} from "@/lib/notion";

const SCHEDULE_DB_ID = process.env.NOTION_SCHEDULE_DATABASE_ID!;

// Name of the property that holds the person's name
const PERSON_PROPERTY_KEY = "Person";

type Slot = {
  id: string; // original Notion property key
  label: string; // e.g. "Breakfast"
  timeRange: string; // e.g. "9:00-10:30"
  isMeal: boolean; // Breakfast / Lunch
};

type ScheduleResponse = {
  people: string[];
  slots: Slot[];
  cells: string[][]; // [row][col] = task
  scheduleDate?: string;
};

// Safe way to pull text out of different Notion property types
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

  // Try to split "Breakfast (9:00-10:30)" into label + time
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

async function resolveScheduleDatabase() {
  // First, attempt to treat the ID as a database (legacy behavior)
  try {
    const meta = await retrieveDatabase(SCHEDULE_DB_ID);
    return { databaseId: SCHEDULE_DB_ID, databaseMeta: meta };
  } catch (err) {
    console.warn("Schedule ID is not a database, attempting to read page children");
  }

  // Otherwise, treat the ID as the main page that contains child databases
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
  });

  const settingsRow = settingsQuery.results?.[0];
  const selectedDate = settingsRow?.properties?.["Selected Schedule"]?.date?.start;

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
  return { databaseId: targetDb.id, databaseMeta, scheduleDate: formattedDate };
}

export async function GET() {
  if (!SCHEDULE_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_SCHEDULE_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  try {
    const resolution = await resolveScheduleDatabase();
    const data = await queryAllDatabasePages(resolution.databaseId);
    const pages = data.results || [];

    if (pages.length === 0) {
      const empty: ScheduleResponse = {
        people: [],
        slots: [],
        cells: [],
        scheduleDate: resolution.scheduleDate,
      };
      return NextResponse.json(empty);
    }

    let slotKeys: string[] = [];

    try {
      const dbMeta =
        resolution.databaseMeta || (await retrieveDatabase(resolution.databaseId));
      const metaProps = dbMeta?.properties || {};
      slotKeys = Object.keys(metaProps).filter(
        (key) => key !== PERSON_PROPERTY_KEY
      );
      // If no explicit date was provided, surface the database title as a hint
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
        (key) => key !== PERSON_PROPERTY_KEY
      );
    }

    // Build slot metadata
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

    // For each page (row) → person + tasks per slot
    for (const page of pages) {
      const personName = getPlainText(page.properties?.[PERSON_PROPERTY_KEY]);
      if (!personName) continue;

      people.push(personName);

      const rowTasks: string[] = [];

      for (const key of orderedKeys) {
        const prop = page.properties?.[key];
        const task = getPlainText(prop);
        rowTasks.push(task || "");
      }

      cells.push(rowTasks);
    }

    const response: ScheduleResponse = {
      people,
      slots,
      cells,
      scheduleDate: resolution.scheduleDate,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch schedule";
    console.error("Failed to fetch schedule from Notion:", err);

    const friendly = "No schedule has been assigned yet.";
    return NextResponse.json(
      {
        people: [],
        slots: [],
        cells: [],
        message: friendly,
      },
      { status: 200 }
    );
  }
}
