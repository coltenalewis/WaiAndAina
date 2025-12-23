import { NextResponse } from "next/server";
import { createPageInDatabase, retrieveDatabase } from "@/lib/notion";
import { resolveScheduleDatabase } from "@/lib/schedule-loader";

function getTitlePropertyKey(meta: any): string {
  const props = meta?.properties || {};
  for (const [key, value] of Object.entries(props)) {
    if ((value as any)?.type === "title") return key;
  }
  return "Person";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { name, dateLabel, staging } = body || {};

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const scheduleContext = await resolveScheduleDatabase({
    dateLabel,
    staging: Boolean(staging),
  });
  const scheduleMeta =
    scheduleContext.databaseMeta ||
    (await retrieveDatabase(scheduleContext.databaseId));
  const titleKey = getTitlePropertyKey(scheduleMeta);

  const page = await createPageInDatabase(scheduleContext.databaseId, {
    [titleKey]: {
      title: [{ type: "text", text: { content: name } }],
    },
  });

  return NextResponse.json({ success: true, id: page.id });
}
