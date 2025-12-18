import { NextResponse } from "next/server";
import { queryAllDatabasePages, updatePage } from "@/lib/notion";

const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID!;
const TASK_STATUS_PROPERTY_KEY = "Status";
const TASK_RECURRING_PROPERTY_KEY = "Recurring";
const COMPLETED_STATUS = "Completed";
const RESET_STATUS = "Not Started";

export async function POST() {
  if (!TASKS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_TASKS_DATABASE_ID is not configured" },
      { status: 500 }
    );
  }

  try {
    const data = await queryAllDatabasePages(TASKS_DB_ID, {
      filter: {
        and: [
          {
            property: TASK_STATUS_PROPERTY_KEY,
            select: { equals: COMPLETED_STATUS },
          },
          {
            property: TASK_RECURRING_PROPERTY_KEY,
            checkbox: { equals: true },
          },
        ],
      },
    });

    const pages = data.results || [];
    for (const page of pages) {
      await updatePage(page.id, {
        [TASK_STATUS_PROPERTY_KEY]: { select: { name: RESET_STATUS } },
      });
    }

    return NextResponse.json({ ok: true, updated: pages.length });
  } catch (err) {
    console.error("Failed to reset recurring tasks:", err);
    return NextResponse.json(
      { error: "Failed to reset recurring tasks" },
      { status: 500 }
    );
  }
}
