import { NextResponse } from "next/server";
import { queryDatabase, retrieveComments } from "@/lib/notion";
import {
  getCachedTaskCommentCount,
  setCachedTaskCommentCount,
} from "@/lib/task-cache";

const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID as string | undefined;
const TASK_NAME_PROPERTY_KEY = "Name";

async function findTaskPageByName(name: string) {
  if (!TASKS_DB_ID) return null;
  const normalized = name.trim();
  if (!normalized) return null;

  const data = await queryDatabase(TASKS_DB_ID, {
    filter: {
      property: TASK_NAME_PROPERTY_KEY,
      title: { equals: normalized },
    },
  });

  if (data.results?.length) return data.results[0];
  return null;
}

export async function POST(req: Request) {
  if (!TASKS_DB_ID) {
    return NextResponse.json({ error: "NOTION_TASKS_DATABASE_ID is not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const names = Array.isArray(body?.names) ? body.names : [];

  if (!names.length) {
    return NextResponse.json({ error: "Missing task names" }, { status: 400 });
  }

  try {
    const resultEntries = await Promise.all(
      names.map(async (name: string) => {
        const cached = getCachedTaskCommentCount(name);
        if (cached !== null) {
          return [name, cached] as const;
        }

        const page = await findTaskPageByName(name);
        if (!page) return [name, 0] as const;

        const commentsRaw = await retrieveComments(page.id);
        const count = Array.isArray(commentsRaw.results) ? commentsRaw.results.length : 0;
        setCachedTaskCommentCount(name, count);
        return [name, count] as const;
      })
    );

    return NextResponse.json({
      counts: Object.fromEntries(resultEntries),
    });
  } catch (err) {
    console.error("POST /task/comment-counts failed:", err);
    return NextResponse.json({ error: "Failed to load comment counts" }, { status: 500 });
  }
}
