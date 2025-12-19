import { NextResponse } from "next/server";
import { queryDatabase, updatePage } from "@/lib/notion";

const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID as string | undefined;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN as string | undefined;
const TASK_NAME_PROPERTY_KEY = "Name";
const TASK_PHOTOS_PROPERTY_KEY = "Photos";

function getPlainText(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return (prop.title || [])
        .map((t: any) => t?.plain_text || "")
        .join("")
        .trim();
    case "rich_text":
      return (prop.rich_text || [])
        .map((t: any) => t?.plain_text || "")
        .join("")
        .trim();
    default:
      return "";
  }
}

async function findTaskPageByName(name: string) {
  if (!TASKS_DB_ID) return null;
  const normalized = name.trim();
  if (!normalized) return null;

  const data = await queryDatabase(TASKS_DB_ID, {
    page_size: 1,
    filter: { property: TASK_NAME_PROPERTY_KEY, title: { equals: normalized } },
  });

  if (data.results?.length) return data.results[0];

  const fallback = await queryDatabase(TASKS_DB_ID, { page_size: 1 });
  return fallback.results?.[0] ?? null;
}

export async function POST(req: Request) {
  if (!TASKS_DB_ID) {
    return NextResponse.json({ error: "NOTION_TASKS_DATABASE_ID is not set" }, { status: 500 });
  }
  if (!BLOB_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN is not set" }, { status: 500 });
  }

  const formData = await req.formData();
  const taskName = String(formData.get("taskName") || "").trim();
  const file = formData.get("file") as File | null;

  if (!taskName || !file) {
    return NextResponse.json({ error: "Missing task name or file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
  }
  if (file.size > 550 * 1024) {
    return NextResponse.json({ error: "Image exceeds 550kb after compression attempt" }, { status: 400 });
  }

  const page = await findTaskPageByName(taskName);
  if (!page) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const uploadRes = await fetch("https://api.vercel.com/v2/blobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BLOB_TOKEN}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-vercel-filename": safeName,
    },
    body: file,
  });

  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) {
    const friendly = uploadJson?.error?.message || "Failed to upload to Vercel Blob";
    return NextResponse.json({ error: friendly }, { status: uploadRes.status });
  }

  const blobUrl = uploadJson?.url;
  if (!blobUrl) {
    return NextResponse.json({ error: "Blob URL missing from upload response" }, { status: 500 });
  }

  const existingFiles = page.properties?.[TASK_PHOTOS_PROPERTY_KEY]?.files || [];
  const nextFiles = [
    ...existingFiles,
    {
      name: safeName,
      external: { url: blobUrl },
    },
  ];

  await updatePage(page.id, {
    [TASK_PHOTOS_PROPERTY_KEY]: {
      files: nextFiles,
    },
  });

  return NextResponse.json({ url: blobUrl });
}
