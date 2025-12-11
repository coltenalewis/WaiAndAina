// src/app/api/schedule/route.ts
import { NextResponse } from "next/server";
import { queryDatabase, retrieveDatabase } from "@/lib/notion";

const SCHEDULE_DB_ID = process.env.NOTION_SCHEDULE_DATABASE_ID!;

// Name of the property that holds the person's name
const PERSON_PROPERTY_KEY = "Person";

type Slot = {
  id: string;        // original Notion property key
  label: string;     // e.g. "Breakfast"
  timeRange: string; // e.g. "9:00-10:30"
  isMeal: boolean;   // Breakfast / Lunch
};

type ScheduleResponse = {
  people: string[];
  slots: Slot[];
  cells: string[][]; // [row][col] = task
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
  // Try to split "Breakfast (9:00-10:30)" into label + time
  const match = key.match(/^(.+?)\s*\((.+)\)\s*$/);
  const label = (match ? match[1] : key).trim();
  const timeRange = (match ? match[2] : "").trim();
  const isMeal = /breakfast|lunch|dinner/i.test(label);
  return { label, timeRange, isMeal };
}

export async function GET() {
  if (!SCHEDULE_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_SCHEDULE_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  try {
    const data = await queryDatabase(SCHEDULE_DB_ID);
    const pages = data.results || [];

    if (pages.length === 0) {
      const empty: ScheduleResponse = { people: [], slots: [], cells: [] };
      return NextResponse.json(empty);
    }

    let slotKeys: string[] = [];

    try {
      const dbMeta = await retrieveDatabase(SCHEDULE_DB_ID);
      const metaProps = dbMeta?.properties || {};
      slotKeys = Object.keys(metaProps)
        .filter((key) => key !== PERSON_PROPERTY_KEY)
        .sort((a, b) => a.localeCompare(b));
    } catch (metaErr) {
      console.error("Failed to retrieve database metadata, falling back to first row:", metaErr);
      const firstProps = pages[0].properties || {};
      slotKeys = Object.keys(firstProps)
        .filter((key) => key !== PERSON_PROPERTY_KEY)
        .sort((a, b) => a.localeCompare(b));
    }

    // Build slot metadata
    const slots: Slot[] = slotKeys.map((key) => {
      const meta = parseSlotMeta(key);
      return {
        id: key,
        label: meta.label,
        timeRange: meta.timeRange,
        isMeal: meta.isMeal,
      };
    });

    const people: string[] = [];
    const cells: string[][] = [];

    // For each page (row) → person + tasks per slot
    for (const page of pages) {
      const personName = getPlainText(page.properties?.[PERSON_PROPERTY_KEY]);
      if (!personName) continue;

      people.push(personName);

      const rowTasks: string[] = [];

      for (const key of slotKeys) {
        const prop = page.properties?.[key];
        const task = getPlainText(prop);
        rowTasks.push(task || "");
      }

      cells.push(rowTasks);
    }

    const response: ScheduleResponse = { people, slots, cells };
    return NextResponse.json(response);
  } catch (err) {
    console.error("Failed to fetch schedule from Notion:", err);
    return NextResponse.json(
      { error: "Failed to fetch schedule from Notion" },
      { status: 500 }
    );
  }
}
