import { NextResponse } from "next/server";
import { createDatabase, queryDatabase, retrieveDatabase } from "@/lib/notion";
import {
  buildDatabasePropertiesFromMeta,
  formatScheduleDateLabel,
  listScheduleDatabases,
  scheduleTitleForDate,
} from "@/lib/schedule-loader";

const SCHEDULE_DB_ID = process.env.NOTION_SCHEDULE_DATABASE_ID!;

async function loadSelectedScheduleDate(settingsDatabaseId?: string) {
  if (!settingsDatabaseId) return null;
  const settingsMeta = await retrieveDatabase(settingsDatabaseId);
  const titleKey = Object.entries(settingsMeta?.properties || {}).find(
    ([, value]) => (value as any)?.type === "title"
  )?.[0];

  if (!titleKey) return null;

  const settingsQuery = await queryDatabase(settingsDatabaseId, {
    page_size: 1,
    filter: {
      property: titleKey,
      title: { equals: "Settings" },
    },
    sorts: [
      {
        property: "Selected Schedule",
        direction: "descending",
      },
    ],
  });

  const settingsRow = settingsQuery.results?.[0];
  const selectedDate = settingsRow?.properties?.["Selected Schedule"]?.date?.start;
  return selectedDate ? formatScheduleDateLabel(selectedDate) : null;
}

export async function GET(req: Request) {
  if (!SCHEDULE_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_SCHEDULE_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const ensureStaging = searchParams.get("ensureStaging") === "1";

  const registry = await listScheduleDatabases();
  if (registry.mode === "database") {
    return NextResponse.json({ mode: registry.mode, schedules: [] });
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

  if (ensureStaging) {
    const creations = Array.from(schedulesByDate.values()).filter(
      (entry) => entry.liveId && !entry.stagingId
    );

    for (const entry of creations) {
      const liveMeta = await retrieveDatabase(entry.liveId!);
      const properties = buildDatabasePropertiesFromMeta(liveMeta);
      const title = scheduleTitleForDate(entry.dateLabel, true);
      const created = await createDatabase(SCHEDULE_DB_ID, title, properties);
      entry.stagingId = created.id;
    }
  }

  const schedules = Array.from(schedulesByDate.values()).sort((a, b) =>
    a.dateLabel.localeCompare(b.dateLabel)
  );

  const selectedDate = await loadSelectedScheduleDate(registry.settingsDatabaseId);

  return NextResponse.json({
    mode: registry.mode,
    schedules,
    selectedDate,
  });
}
