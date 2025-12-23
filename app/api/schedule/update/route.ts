import { NextResponse } from "next/server";
import { queryDatabase, retrieveDatabase, updateDatabase, updatePage } from "@/lib/notion";
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
    const {
      person,
      slotId,
      addTask,
      removeTask,
      replaceValue,
      reportValue,
      dateLabel,
      staging,
    } = body || {};

    if (!person || !slotId) {
      return NextResponse.json(
        { error: "Missing person or slot" },
        { status: 400 }
      );
    }

    const context = await resolveScheduleDatabase({
      dateLabel,
      staging: Boolean(staging),
    });
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

    const slotMeta = meta?.properties?.[slotId];
    if (slotMeta?.type === "checkbox") {
      await updatePage(page.id, {
        [slotId]: { checkbox: Boolean(reportValue) },
      });
      return NextResponse.json({ success: true, value: Boolean(reportValue) });
    }

    const currentValue = getPlainText(page.properties?.[slotId]);
    const baseValue =
      replaceValue !== undefined ? replaceValue : currentValue;
    const normalizedValue =
      slotMeta?.type === "multi_select"
        ? baseValue.split("\n")[0] || ""
        : baseValue;
    let tasks = splitTasks(normalizedValue);

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

    if (slotMeta?.type === "multi_select") {
      const existingOptions = slotMeta.multi_select?.options || [];
      const existingNames = new Set(
        existingOptions.map((opt: any) => (opt?.name || "").toLowerCase())
      );
      const trimmedTasks = tasks.map((task) => task.trim()).filter(Boolean);
      const missing = trimmedTasks.filter(
        (task) => !existingNames.has(task.toLowerCase())
      );

      if (missing.length) {
        const nextOptions = [
          ...existingOptions,
          ...missing.map((name: string) => ({ name })),
        ];
        await updateDatabase(databaseId, {
          [slotId]: {
            multi_select: {
              options: nextOptions,
            },
          },
        });
      }

      await updatePage(page.id, {
        [slotId]: {
          multi_select: trimmedTasks.map((task) => ({ name: task })),
        },
      });
      return NextResponse.json({ success: true, value: trimmedTasks });
    }

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
