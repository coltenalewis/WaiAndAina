import { NextResponse } from "next/server";
import { createDatabase, retrieveDatabase } from "@/lib/notion";
import {
  buildDatabasePropertiesFromMeta,
  formatScheduleDateLabel,
  listScheduleDatabases,
  scheduleTitleForDate,
} from "@/lib/schedule-loader";

const SCHEDULE_DB_ID = process.env.NOTION_SCHEDULE_DATABASE_ID!;

function pickTemplateDatabaseId(schedules: {
  dateLabel: string;
  liveId?: string;
  stagingId?: string;
}[]) {
  const live = schedules.find((entry) => entry.liveId);
  return live?.liveId || schedules.find((entry) => entry.stagingId)?.stagingId;
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

  const normalizedDate = formatScheduleDateLabel(dateLabel);

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

  const target = schedulesByDate.get(normalizedDate) || { dateLabel: normalizedDate };
  const templateId = pickTemplateDatabaseId(Array.from(schedulesByDate.values()));
  if (!templateId) {
    return NextResponse.json(
      { error: "No template schedule database found to copy schema." },
      { status: 400 }
    );
  }

  const templateMeta = await retrieveDatabase(templateId);
  const properties = buildDatabasePropertiesFromMeta(templateMeta);

  if (!target.liveId) {
    const title = scheduleTitleForDate(normalizedDate, false);
    const created = await createDatabase(SCHEDULE_DB_ID, title, properties);
    target.liveId = created.id;
  }

  if (!target.stagingId) {
    const title = scheduleTitleForDate(normalizedDate, true);
    const created = await createDatabase(SCHEDULE_DB_ID, title, properties);
    target.stagingId = created.id;
  }

  return NextResponse.json({
    success: true,
    liveId: target.liveId,
    stagingId: target.stagingId,
  });
}
