import { NextResponse } from "next/server";
import {
  archivePage,
  createPageInDatabase,
  queryAllDatabasePages,
  retrieveDatabase,
} from "@/lib/notion";
import { resolveScheduleDatabase } from "@/lib/schedule-loader";

const USERS_DB_ID = process.env.NOTION_USERS_DATABASE_ID!;

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
    default:
      return "";
  }
}

function getTitlePropertyKey(meta: any): string {
  const props = meta?.properties || {};
  for (const [key, value] of Object.entries(props)) {
    if ((value as any)?.type === "title") return key;
  }
  return "Person";
}

export async function POST(req: Request) {
  if (!USERS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_USERS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const { dateLabel, staging } = body || {};

  const scheduleContext = await resolveScheduleDatabase({
    dateLabel,
    staging: Boolean(staging),
  });

  const scheduleMeta =
    scheduleContext.databaseMeta ||
    (await retrieveDatabase(scheduleContext.databaseId));
  const scheduleTitleKey = getTitlePropertyKey(scheduleMeta);

  const schedulePages = await queryAllDatabasePages(
    scheduleContext.databaseId
  );
  const scheduleRows = schedulePages.results || [];

  const existingRows = scheduleRows.map((page: any) => ({
    id: page.id,
    name: getPlainText(page.properties?.[scheduleTitleKey]),
  }));

  const users = await queryAllDatabasePages(USERS_DB_ID);
  const volunteerNames = (users.results || [])
    .map((page: any) => {
      const props = page.properties || {};
      return {
        name: getPlainText(props["Name"]),
        role: getPlainText(props["User Type"]),
      };
    })
    .filter((entry: { name: string; role: string }) => entry.name)
    .filter((entry: { name: string; role: string }) => entry.role.toLowerCase() === "volunteer")
    .map((entry: { name: string; role: string }) => entry.name);

  const volunteerSet = new Set(volunteerNames.map((n) => n.toLowerCase()));

  const missing = volunteerNames.filter(
    (name) =>
      !existingRows.some((row) => row.name.toLowerCase() === name.toLowerCase())
  );

  const toArchive = existingRows.filter(
    (row) => row.name && !volunteerSet.has(row.name.toLowerCase())
  );

  for (const name of missing) {
    await createPageInDatabase(scheduleContext.databaseId, {
      [scheduleTitleKey]: {
        title: [{ type: "text", text: { content: name } }],
      },
    });
  }

  for (const row of toArchive) {
    await archivePage(row.id, true);
  }

  return NextResponse.json({
    success: true,
    added: missing.length,
    removed: toArchive.length,
  });
}
