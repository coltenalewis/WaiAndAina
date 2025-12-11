import { NextResponse } from "next/server";
import { retrieveDatabase } from "@/lib/notion";

const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID!;
const TASK_TYPE_PROPERTY_KEY = "Task Type";

type TaskTypeOption = { name: string; color: string };

const FALLBACK_TYPES: TaskTypeOption[] = [
  { name: "General", color: "default" },
  { name: "Animal Care", color: "green" },
  { name: "Field Work", color: "orange" },
  { name: "Maintenance", color: "blue" },
];

export async function GET() {
  if (!TASKS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_TASKS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  try {
    const db = await retrieveDatabase(TASKS_DB_ID);
    const props = db?.properties || {};
    const typeProp = props[TASK_TYPE_PROPERTY_KEY];

    if (typeProp?.type === "select" && Array.isArray(typeProp.select?.options)) {
      const options: TaskTypeOption[] = typeProp.select.options.map((opt: any) => ({
        name: opt.name || "",
        color: opt.color || "default",
      }));

      return NextResponse.json({ types: options });
    }
  } catch (err) {
    console.error("Failed to load task types from Notion", err);
  }

  return NextResponse.json({ types: FALLBACK_TYPES });
}
