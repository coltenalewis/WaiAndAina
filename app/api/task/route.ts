import { NextResponse } from "next/server";
import {
  createComment,
  queryDatabase,
  retrieveComments,
  updatePage,
} from "@/lib/notion";

const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID!;

// ─────────────────────────────────────────────
// Notion property keys
// ─────────────────────────────────────────────
const TASK_NAME_PROPERTY_KEY = "Name"; // title
const TASK_DESC_PROPERTY_KEY = "Description"; // rich_text
const TASK_STATUS_PROPERTY_KEY = "Status"; // select
const TASK_PHOTOS_PROPERTY_KEY = "Photos"; // files
const TASK_TYPE_PROPERTY_KEY = "Task Type"; // select
const TASK_LINKS_PROPERTY_KEY = "Links"; // rich_text / url
const TASK_ESTIMATE_PROPERTY_KEY = "Estimated Time"; // rich_text

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getPlainText(prop: any): string {
  if (!prop) return "";

  if (Array.isArray(prop)) {
    return prop.map((t: any) => t.plain_text || "").join("").trim();
  }

  switch (prop.type) {
    case "title":
      return (prop.title || []).map((t: any) => t.plain_text || "").join("").trim();
    case "rich_text":
      return (prop.rich_text || []).map((t: any) => t.plain_text || "").join("").trim();
    case "select":
      return prop.select?.name || "";
    case "multi_select":
      return (prop.multi_select || []).map((s: any) => s.name || "").join(", ").trim();
    case "url":
      return prop.url || "";
    case "files":
      return (prop.files || []).map((f: any) => f.name || "").join(", ").trim();
    default:
      if (Array.isArray(prop.rich_text)) {
        return prop.rich_text.map((t: any) => t.plain_text || "").join("").trim();
      }
      return "";
  }
}

function parseLinks(raw: string): { label: string; url: string }[] {
  if (!raw.trim()) return [];

  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^\[(.+?)\](.+)$/);
      if (match) {
        return { label: match[1].trim(), url: match[2].trim() };
      }
      return { label: entry, url: entry };
    });
}

async function findTaskPageByName(name: string) {
  const normalized = name.trim();
  if (!normalized) return null;

  const data = await queryDatabase(TASKS_DB_ID, {
    filter: {
      property: TASK_NAME_PROPERTY_KEY,
      title: { equals: normalized },
    },
  });

  if (data.results?.length) return data.results[0];

  const fallback = await queryDatabase(TASKS_DB_ID, { page_size: 1 });
  return fallback.results?.[0] ?? null;
}

// ─────────────────────────────────────────────
// GET — fetch task details
// ─────────────────────────────────────────────
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
    return NextResponse.json({ error: "Missing task name" }, { status: 400 });
  }

  try {
    const page = await findTaskPageByName(name);
    if (!page) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const props = page.properties || {};

    const pageName = getPlainText(props[TASK_NAME_PROPERTY_KEY]) || name;
    const description = getPlainText(props[TASK_DESC_PROPERTY_KEY]);
    const status = getPlainText(props[TASK_STATUS_PROPERTY_KEY]);
    const links = parseLinks(getPlainText(props[TASK_LINKS_PROPERTY_KEY]));
    const estimatedTime = getPlainText(props[TASK_ESTIMATE_PROPERTY_KEY]);

    const typeProp = props[TASK_TYPE_PROPERTY_KEY];
    const taskType =
      typeProp?.type === "select"
        ? {
            name: typeProp.select?.name || "",
            color: typeProp.select?.color || "default",
          }
        : { name: "", color: "default" };

    const photosProp = props[TASK_PHOTOS_PROPERTY_KEY];
    const media =
      photosProp?.type === "files"
        ? (photosProp.files || []).map((file: any) => {
            const fileName = file.name || "Attachment";
            const url = file.external?.url || file.file?.url || "";
            const lower = fileName.toLowerCase();

            let kind: "image" | "video" | "audio" | "file" = "file";
            if (/(\.png|\.jpe?g|\.gif|\.webp|\.avif)$/i.test(lower)) kind = "image";
            else if (/(\.mp4|\.mov|\.m4v)$/i.test(lower)) kind = "video";
            else if (/(\.mp3|\.wav|\.m4a)$/i.test(lower)) kind = "audio";

            return { name: fileName, url, kind };
          })
        : [];

    const commentsRaw = await retrieveComments(page.id);
    const comments = (commentsRaw.results || []).map((c: any) => {
      const raw = getPlainText(c.rich_text) || "";
      const idx = raw.indexOf(":");

      return {
        id: c.id,
        text: idx > -1 ? raw.slice(idx + 1).trim() : raw,
        author:
          idx > -1 ? raw.slice(0, idx).trim() : c.created_by?.name || "Unknown",
        createdTime: c.created_time,
      };
    });

    return NextResponse.json({
      id: page.id,
      name: pageName,
      description,
      status,
      links,
      taskType,
      media,
      estimatedTime,
      comments,
    });
  } catch (err) {
    console.error("GET /task failed:", err);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PATCH — update task status
// ─────────────────────────────────────────────
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
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await updatePage(page.id, {
      [TASK_STATUS_PROPERTY_KEY]: { select: { name: status } },
    });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error("PATCH /task failed:", err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST — add comment
// ─────────────────────────────────────────────
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
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await createComment(page.id, [
      {
        type: "text",
        text: { content: comment },
      },
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /task failed:", err);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
