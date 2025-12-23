import { NextResponse } from "next/server";
import {
  archivePage,
  createDatabase,
  createPageInDatabase,
  queryAllDatabasePages,
  retrieveDatabase,
  updatePage,
} from "@/lib/notion";
import {
  buildDatabasePropertiesFromMeta,
  formatScheduleDateLabel,
  listScheduleDatabases,
  loadScheduleData,
  scheduleTitleForDate,
} from "@/lib/schedule-loader";

const SCHEDULE_DB_ID = process.env.NOTION_SCHEDULE_DATABASE_ID!;

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

function getTitlePropertyKey(meta: any): string {
  const props = meta?.properties || {};
  for (const [key, value] of Object.entries(props)) {
    if ((value as any)?.type === "title") return key;
  }
  return "Person";
}

export async function POST(req: Request) {
  if (!SCHEDULE_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_SCHEDULE_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const { dateLabel } = body || {};
  if (!dateLabel) {
    return NextResponse.json({ error: "Missing dateLabel" }, { status: 400 });
  }

  const formattedDate = formatScheduleDateLabel(dateLabel);
  const registry = await listScheduleDatabases();
  if (registry.mode === "database") {
    return NextResponse.json(
      { error: "Schedule root is not a page" },
      { status: 400 }
    );
  }

  const schedulesByDate = new Map<
    string,
    { dateLabel: string; liveId?: string; stagingId?: string }
  >();

  registry.schedules.forEach((entry) => {
    if (!schedulesByDate.has(entry.dateLabel)) {
      schedulesByDate.set(entry.dateLabel, {
        dateLabel: entry.dateLabel,
        liveId: entry.isStaging ? undefined : entry.id,
        stagingId: entry.isStaging ? entry.id : undefined,
      });
    } else {
      const existing = schedulesByDate.get(entry.dateLabel)!;
      if (entry.isStaging) {
        existing.stagingId = entry.id;
      } else {
        existing.liveId = entry.id;
      }
    }
  });

  const target = schedulesByDate.get(formattedDate);
  if (!target?.stagingId) {
    return NextResponse.json(
      { error: `No staging schedule found for ${formattedDate}` },
      { status: 404 }
    );
  }

  let liveId = target.liveId;
  if (!liveId) {
    const templateMeta = await retrieveDatabase(target.stagingId);
    const properties = buildDatabasePropertiesFromMeta(templateMeta);
    const liveTitle = scheduleTitleForDate(formattedDate, false);
    const created = await createDatabase(SCHEDULE_DB_ID, liveTitle, properties);
    liveId = created?.id;
  }

  if (!liveId) {
    return NextResponse.json(
      { error: "Unable to create live schedule database." },
      { status: 500 }
    );
  }

  const stagingData = await loadScheduleData({
    dateLabel: formattedDate,
    staging: true,
  });

  const liveMeta = await retrieveDatabase(liveId);
  const titleKey = getTitlePropertyKey(liveMeta);

  const liveRows = await queryAllDatabasePages(liveId);
  const livePages = liveRows.results || [];
  const liveByName = new Map<string, any>(
    livePages.map((page: any) => [
      getPlainText(page.properties?.[titleKey]),
      page,
    ])
  );

  const stagingNames = new Set(stagingData.people);

  for (const person of stagingData.people) {
    const properties: Record<string, any> = {};
    const rowIndex = stagingData.people.indexOf(person);
    stagingData.slots.forEach((slot, slotIndex) => {
      properties[slot.id] = {
        rich_text: [
          {
            type: "text",
            text: { content: stagingData.cells[rowIndex]?.[slotIndex] || "" },
          },
        ],
      };
    });

    const existing = liveByName.get(person);
    if (existing) {
      await updatePage(existing.id, properties);
    } else {
      const createProps: Record<string, any> = {
        [titleKey]: {
          title: [{ type: "text", text: { content: person } }],
        },
        ...properties,
      };
      await createPageInDatabase(liveId, createProps);
    }
  }

  const liveNames = livePages
    .map((page: any) => ({
      id: page.id,
      name: getPlainText(page.properties?.[titleKey]),
    }))
    .filter((entry) => entry.name);

  for (const entry of liveNames) {
    if (!stagingNames.has(entry.name)) {
      await archivePage(entry.id, true);
    }
  }

  return NextResponse.json({ success: true });
}
