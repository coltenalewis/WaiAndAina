import { NextResponse } from "next/server";
import { retrieveDatabase } from "@/lib/notion";

const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID!;
const TASK_TYPE_PROPERTY_KEY = "Task Type";
const TASK_STATUS_PROPERTY_KEY = "Status";

type TaskTypeOption = { name: string; color: string };
type StatusOption = { name: string; color: string };

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
    const statusProp = props[TASK_STATUS_PROPERTY_KEY];

    const types: TaskTypeOption[] | undefined =
      typeProp?.type === "select" && Array.isArray(typeProp.select?.options)
        ? typeProp.select.options.map((opt: any) => ({
            name: opt.name || "",
            color: opt.color || "default",
          }))
        : undefined;

    const statuses: StatusOption[] | undefined =
      statusProp?.type === "select" && Array.isArray(statusProp.select?.options)
        ? statusProp.select.options.map((opt: any) => ({
            name: opt.name || "",
            color: opt.color || "default",
          }))
        : undefined;

    if (types || statuses) {
      return NextResponse.json({
        types: types ?? FALLBACK_TYPES,
        statuses: statuses ?? [
          { name: "Not Started", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "Completed", color: "green" },
        ],
      });
    }
  } catch (err) {
    console.error("Failed to load task types from Notion", err);
  }

  return NextResponse.json({
    types: FALLBACK_TYPES,
    statuses: [
      { name: "Not Started", color: "gray" },
      { name: "In Progress", color: "blue" },
      { name: "Completed", color: "green" },
    ],
  });
}
