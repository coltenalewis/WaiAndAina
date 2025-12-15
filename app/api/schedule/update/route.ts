import { NextResponse } from "next/server";
import { queryDatabase, retrieveDatabase, updatePage } from "@/lib/notion";
import { resolveScheduleDatabase } from "@/lib/schedule-loader";

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
    default:
      return "";
  }
}

function splitTasks(value: string) {
  if (!value) return [] as string[];
  return value
    .split(/,|\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function joinTasks(tasks: string[]) {
  return tasks.join(", ");
}

function getTitlePropertyKey(meta: any): string {
  const props = meta?.properties || {};
  for (const [key, value] of Object.entries(props)) {
    if ((value as any)?.type === "title") return key;
  }
  return "Person";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { person, slotId, addTask, removeTask, replaceValue } = body || {};

    if (!person || !slotId) {
      return NextResponse.json(
        { error: "Missing person or slot" },
        { status: 400 }
      );
    }

    const context = await resolveScheduleDatabase();
    const databaseId = context.databaseId;
    const meta = context.databaseMeta || (await retrieveDatabase(databaseId));
    const titleKey = getTitlePropertyKey(meta);

    const query = await queryDatabase(databaseId, {
      page_size: 1,
      filter: {
        property: titleKey,
        title: { equals: person },
      },
    });

    const page = query.results?.[0];
    if (!page) {
      return NextResponse.json(
        { error: "Person row not found" },
        { status: 404 }
      );
    }

    const currentValue = getPlainText(page.properties?.[slotId]);
    let tasks =
      replaceValue !== undefined ? splitTasks(replaceValue) : splitTasks(currentValue);

    if (removeTask) {
      tasks = tasks.filter(
        (t) => t.toLowerCase() !== String(removeTask).trim().toLowerCase()
      );
    }

    if (addTask) {
      const exists = tasks.some(
        (t) => t.toLowerCase() === String(addTask).trim().toLowerCase()
      );
      if (!exists) tasks.push(String(addTask).trim());
    }

    const nextValue = joinTasks(tasks);

    await updatePage(page.id, {
      [slotId]: {
        rich_text: [
          {
            type: "text",
            text: { content: nextValue },
          },
        ],
      },
    });

    return NextResponse.json({ success: true, value: nextValue });
  } catch (err) {
    console.error("Schedule update failed:", err);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 }
    );
  }
}
