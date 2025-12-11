import { NextResponse } from "next/server";
import {
  createComment,
  queryDatabase,
  retrieveComments,
  updatePage,
} from "@/lib/notion";

const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID!;

// Notion property names in your Tasks DB
const TASK_NAME_PROPERTY_KEY = "Name";        // title
const TASK_DESC_PROPERTY_KEY = "Description"; // rich_text
const TASK_STATUS_PROPERTY_KEY = "Status";    // select

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

async function findTaskPageByName(name: string) {
  const normalized = name.trim();
  if (!normalized) return null;

  const data = await queryDatabase(TASKS_DB_ID, {
    filter: {
      property: TASK_NAME_PROPERTY_KEY,
      title: {
        equals: normalized,
      },
    },
  });

  if (data.results?.length) {
    return data.results[0];
  }

  // Fallback: return the first page if no exact match
  const fallback = await queryDatabase(TASKS_DB_ID, { page_size: 1 });
  return fallback.results?.[0] ?? null;
}

export async function GET(req: Request) {
  if (!TASKS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_TASKS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  if (!name) {
    return NextResponse.json(
      { error: "Missing task name" },
      { status: 400 }
    );
  }

  try {
    const page = await findTaskPageByName(name);
    if (!page) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    const props = page.properties || {};
    const pageName = getPlainText(props[TASK_NAME_PROPERTY_KEY]) || name;
    const description = getPlainText(props[TASK_DESC_PROPERTY_KEY]);
    const status = getPlainText(props[TASK_STATUS_PROPERTY_KEY]);

    const commentsRaw = await retrieveComments(page.id);
    const comments = (commentsRaw.results || []).map((c: any) => ({
      id: c.id,
      text: getPlainText(c.rich_text) || "",
      createdTime: c.created_time,
      author: c.created_by?.name || "Unknown",
    }));

    return NextResponse.json({
      id: page.id,
      name: pageName,
      description: description || "",
      status: status || "",
      comments,
    });
  } catch (err) {
    console.error("Failed to fetch task details from Notion:", err);
    return NextResponse.json(
      { error: "Failed to fetch task details" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  if (!TASKS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_TASKS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const { name, status } = body || {};

  if (!name || !status) {
    return NextResponse.json(
      { error: "Missing task name or status" },
      { status: 400 }
    );
  }

  try {
    const page = await findTaskPageByName(name);
    if (!page) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    await updatePage(page.id, {
      [TASK_STATUS_PROPERTY_KEY]: { select: { name: status } },
    });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error("Failed to update task status:", err);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!TASKS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_TASKS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const { name, comment } = body || {};

  if (!name || !comment) {
    return NextResponse.json(
      { error: "Missing task name or comment" },
      { status: 400 }
    );
  }

  try {
    const page = await findTaskPageByName(name);
    if (!page) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    await createComment(page.id, [
      {
        type: "text",
        text: { content: comment },
      },
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to add comment:", err);
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 }
    );
  }
}
