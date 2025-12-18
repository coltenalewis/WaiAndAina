import { NextResponse } from "next/server";
import {
  createPageInDatabase,
  createPageUnderPage,
  listAllBlockChildren,
  queryAllDatabasePages,
  queryDatabase,
  retrieveComments,
  retrieveDatabase,
  retrievePage,
  updatePage,
} from "@/lib/notion";
import { loadScheduleData, Slot } from "@/lib/schedule-loader";

const REPORTS_DB_ID = process.env.NOTION_REPORTS_DATABASE_ID!;
const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID!;

const TASK_NAME_PROPERTY_KEY = "Name";
const TASK_STATUS_PROPERTY_KEY = "Status";
const TASK_DESC_PROPERTY_KEY = "Description";
const TASK_NOTES_PROPERTY_KEY = "Extra Notes";
const TASK_RECURRING_PROPERTY_KEY = "Recurring";
const COMPLETED_STATUS = "Completed";
const RESET_STATUS = "Not Started";

type RichTextNode = { plain: string; href?: string; annotations?: any };
type ReportBlock = {
  id: string;
  type: string;
  richText?: RichTextNode[];
  checked?: boolean;
  url?: string;
  caption?: RichTextNode[];
  children?: ReportBlock[];
};

function mapRichText(richText: any[] = []): RichTextNode[] {
  return richText.map((t: any) => ({
    plain: t.plain_text || "",
    href: t.href || undefined,
    annotations: t.annotations || {},
  }));
}

function getPlainText(prop: any): string {
  if (!prop) return "";

  if (Array.isArray(prop)) {
    return prop
      .map((t: any) => t.plain_text || "")
      .join("")
      .trim();
  }

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
  return "Name";
}

function getDatePropertyKey(meta: any): string | null {
  const props = meta?.properties || {};
  for (const [key, value] of Object.entries(props)) {
    if ((value as any)?.type === "date") return key;
  }
  return null;
}

async function buildBlocks(blockId: string): Promise<ReportBlock[]> {
  const data = await listAllBlockChildren(blockId);

  const blocks = await Promise.all(
    (data.results || []).map(async (block: any) => {
      let children: ReportBlock[] = [];
      if (block.has_children) {
        children = await buildBlocks(block.id);
      }

      switch (block.type) {
        case "heading_1":
        case "heading_2":
        case "heading_3":
        case "paragraph":
        case "quote":
        case "callout":
          return {
            id: block.id,
            type: block.type,
            richText: mapRichText(block[block.type]?.rich_text),
            children,
          } as ReportBlock;
        case "bulleted_list_item":
        case "numbered_list_item":
          return {
            id: block.id,
            type: block.type,
            richText: mapRichText(block[block.type]?.rich_text),
            children,
          } as ReportBlock;
        case "to_do":
          return {
            id: block.id,
            type: "to_do",
            richText: mapRichText(block.to_do?.rich_text),
            checked: !!block.to_do?.checked,
            children,
          } as ReportBlock;
        case "bookmark":
          return {
            id: block.id,
            type: "bookmark",
            url: block.bookmark?.url,
            caption: mapRichText(block.bookmark?.caption),
            children,
          } as ReportBlock;
        case "image": {
          const image = block.image;
          const url =
            image?.type === "external" ? image.external?.url : image?.file?.url;
          return {
            id: block.id,
            type: "image",
            url,
            caption: mapRichText(image?.caption),
            children,
          } as ReportBlock;
        }
        case "divider":
          return { id: block.id, type: "divider" } as ReportBlock;
        case "child_page":
          return null;
        default:
          return {
            id: block.id,
            type: "unsupported",
            richText: mapRichText(block[block.type]?.rich_text || []),
            children,
          } as ReportBlock;
      }
    })
  );

  return blocks.filter(Boolean) as ReportBlock[];
}

function baseTaskName(task: string) {
  return (task || "").split("\n")[0].trim();
}

function isOffPlaceholder(task: string) {
  return baseTaskName(task) === "-";
}

function toIso(dateLabel?: string) {
  if (!dateLabel) return new Date().toISOString();
  const [month, day, year] = dateLabel.split("/").map((v) => Number(v));
  if (month && day && year) {
    const dt = new Date(year, month - 1, day);
    return dt.toISOString();
  }
  const parsed = new Date(dateLabel);
  return parsed.toISOString();
}

type TaskDetail = {
  name: string;
  status: string;
  description: string;
  extraNotes: string;
  comments: { author: string; text: string; createdTime: string }[];
};

async function fetchTaskDetail(name: string): Promise<TaskDetail | null> {
  if (!name) return null;

  const data = await queryDatabase(TASKS_DB_ID, {
    page_size: 1,
    filter: {
      property: TASK_NAME_PROPERTY_KEY,
      title: {
        equals: name,
      },
    },
  });

  const page = data.results?.[0];
  if (!page) return null;

  const props = page.properties || {};
  const status = getPlainText(props[TASK_STATUS_PROPERTY_KEY]);
  const description = getPlainText(props[TASK_DESC_PROPERTY_KEY]);
  const extraNotes = getPlainText(props[TASK_NOTES_PROPERTY_KEY]);
  const commentsRaw = await retrieveComments(page.id);
  const comments = (commentsRaw.results || []).map((c: any) => {
    const rawText = getPlainText(c.rich_text) || "";
    const colonIndex = rawText.indexOf(":");
    const parsedAuthor =
      colonIndex > -1 ? rawText.slice(0, colonIndex).trim() : "";
    const parsedMessage =
      colonIndex > -1 ? rawText.slice(colonIndex + 1).trim() : rawText;

    return {
      id: c.id,
      text: parsedMessage,
      createdTime: c.created_time,
      author: parsedAuthor || c.created_by?.name || "Unknown",
    };
  });

  return {
    name,
    status: status || "",
    description: description || "",
    extraNotes: extraNotes || "",
    comments,
  };
}

type Assignment = {
  person: string;
  slot: Slot;
  taskName: string;
};

function buildAssignments(
  people: string[],
  slots: Slot[],
  cells: string[][]
): Assignment[] {
  const items: Assignment[] = [];

  people.forEach((person, rowIdx) => {
    const row = cells[rowIdx] || [];

    slots.forEach((slot, colIdx) => {
      const raw = row[colIdx] || "";
      if (!raw) return;

      const splitTasks = raw
        .split(/,|\n/)
        .map((t) => t.trim())
        .filter(Boolean);

      splitTasks.forEach((task) => {
        items.push({ person, slot, taskName: task });
      });
    });
  });

  return items;
}

function paragraph(content: string) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: { content },
        },
      ],
    },
  };
}

function heading(content: string, level: 2 | 3 = 2) {
  return {
    object: "block",
    type: level === 2 ? "heading_2" : "heading_3",
    [level === 2 ? "heading_2" : "heading_3"]: {
      rich_text: [
        {
          type: "text",
          text: { content },
        },
      ],
    },
  };
}

function bullet(content: string, children: any[] = []) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        {
          type: "text",
          text: { content },
        },
      ],
      ...(children.length ? { children } : {}),
    },
  };
}

async function resolveReportsParent() {
  let meta: any | null = null;
  let isDatabase = true;
  let titleKey = "Name";
  let dateKey: string | null = null;

  try {
    meta = await retrieveDatabase(REPORTS_DB_ID);
    titleKey = getTitlePropertyKey(meta);
    dateKey = getDatePropertyKey(meta);
  } catch (err) {
    isDatabase = false;
    await retrievePage(REPORTS_DB_ID);
  }

  return { isDatabase, meta, titleKey, dateKey };
}

async function reportExists(
  scheduleLabel: string,
  parentInfo: Awaited<ReturnType<typeof resolveReportsParent>>
) {
  const title = `Daily Report — ${scheduleLabel}`;
  if (parentInfo.isDatabase) {
    const results = await queryDatabase(REPORTS_DB_ID, {
      page_size: 1,
      filter: {
        property: parentInfo.titleKey,
        title: { equals: title },
      },
    });
    return Boolean(results.results?.length);
  }

  const children = await listAllBlockChildren(REPORTS_DB_ID);
  return (children.results || []).some(
    (block: any) => block.type === "child_page" && block.child_page?.title === title
  );
}

async function createReportFromSchedule(schedule: any) {
  const assignments = buildAssignments(
    schedule.people,
    schedule.slots,
    schedule.cells
  );

  // Filter out "-" placeholders before doing any heavy work.
  const filteredAssignments = assignments.filter(
    (a) => a.taskName && !isOffPlaceholder(a.taskName)
  );

  const uniqueTasks = Array.from(
    new Set(
      filteredAssignments
        .map((a) => baseTaskName(a.taskName))
        .filter(Boolean)
    )
  );

  const taskDetails = new Map<string, TaskDetail | null>();
  for (const taskName of uniqueTasks) {
    try {
      const detail = await fetchTaskDetail(taskName);
      taskDetails.set(taskName, detail);
    } catch (err) {
      console.error(`Failed to load task detail for ${taskName}:`, err);
      taskDetails.set(taskName, null);
    }
  }

  const parentInfo = await resolveReportsParent();
  const scheduleLabel = schedule.scheduleDate || new Date().toLocaleDateString();
  const isoDate = toIso(schedule.scheduleDate);

  const children: any[] = [
    heading(`Daily Report — ${scheduleLabel}`, 2),
    paragraph(
      `Generated ${new Date().toLocaleString()} with ${filteredAssignments.length} assignments.`
    ),
  ];

  if (filteredAssignments.length === 0) {
    children.push(paragraph("No assignments were recorded for this schedule."));
  } else {
    schedule.slots.forEach((slot: Slot) => {
      const slotAssignments = filteredAssignments.filter(
        (a) => a.slot.id === slot.id
      );
      if (!slotAssignments.length) return;

      children.push(
        heading(
          `${slot.label}${slot.timeRange ? ` (${slot.timeRange})` : ""}`,
          3
        )
      );

      slotAssignments.forEach((assignment) => {
        const baseName = baseTaskName(assignment.taskName);
        const detail = (baseName && taskDetails.get(baseName)) || null;
        const statusLabel = detail?.status ? ` [${detail.status}]` : "";
        const description = detail?.description;
        const notes = detail?.extraNotes;
        const comments = detail?.comments || [];

        const detailChildren: any[] = [];
        if (description) {
          detailChildren.push(paragraph(`Description: ${description}`));
        }
        if (notes) {
          detailChildren.push(paragraph(`Extra notes: ${notes}`));
        }
        if (comments.length) {
          const commentBullets = comments.map((c) =>
            bullet(
              `${c.author}: ${c.text} (${new Date(c.createdTime).toLocaleString()})`
            )
          );
          detailChildren.push(bullet("Comments:", commentBullets));
        }

        children.push(
          bullet(
            `${assignment.person}: ${assignment.taskName}${statusLabel}`,
            detailChildren
          )
        );
      });
    });
  }

  const properties: any = parentInfo.isDatabase
    ? {
        [parentInfo.titleKey]: {
          title: [
            {
              type: "text",
              text: { content: `Daily Report — ${scheduleLabel}` },
            },
          ],
        },
      }
    : {
        title: [
          {
            type: "text",
            text: { content: `Daily Report — ${scheduleLabel}` },
          },
        ],
      };

  if (parentInfo.isDatabase && parentInfo.dateKey) {
    properties[parentInfo.dateKey] = {
      date: { start: isoDate },
    };
  }

  const page = parentInfo.isDatabase
    ? await createPageInDatabase(REPORTS_DB_ID, properties, children)
    : await createPageUnderPage(REPORTS_DB_ID, properties, children);

  return page;
}

function hawaiiNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Pacific/Honolulu",
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function parseTimeToMinutes(label?: string | null): number | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i
  );
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const ampm = match[3]?.toLowerCase();

  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function isWithinWindow(
  targetTime?: string | null,
  windowMinutes = 10
): boolean {
  const targetMinutes = parseTimeToMinutes(targetTime);
  if (targetMinutes === null) return true;

  const now = hawaiiNowMinutes();
  let diff = Math.abs(now - targetMinutes);
  if (diff > 720) {
    diff = 1440 - diff; // wraparound near midnight
  }
  return diff <= windowMinutes;
}

async function resetRecurringTasks() {
  try {
    const data = await queryAllDatabasePages(TASKS_DB_ID, {
      filter: {
        and: [
          {
            property: TASK_STATUS_PROPERTY_KEY,
            select: { equals: COMPLETED_STATUS },
          },
          {
            property: TASK_RECURRING_PROPERTY_KEY,
            checkbox: { equals: true },
          },
        ],
      },
    });

    const pages = data.results || [];
    for (const page of pages) {
      await updatePage(page.id, {
        [TASK_STATUS_PROPERTY_KEY]: { select: { name: RESET_STATUS } },
      });
    }

    return { updated: pages.length };
  } catch (err) {
    console.error("Failed to reset recurring tasks:", err);
    return { updated: 0, error: true };
  }
}

export async function GET(req: Request) {
  if (!REPORTS_DB_ID || !TASKS_DB_ID) {
    return NextResponse.json(
      { error: "Reports or Tasks database ID is not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const listOnly = searchParams.get("list");
  const reportId = searchParams.get("id");

  if (reportId) {
    try {
      const page = await retrievePage(reportId);
      if (!page || (page as any).object === "error") {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }

      const blocks = await buildBlocks(reportId);
      const title =
        page.properties?.Name?.title?.[0]?.plain_text ||
        page.properties?.title?.title?.[0]?.plain_text ||
        "Daily Report";

      return NextResponse.json({
        report: {
          id: reportId,
          title,
          date: page.created_time,
        },
        blocks,
      });
    } catch (err) {
      console.error("Failed to load report detail", err);
      return NextResponse.json(
        { error: "Unable to load report" },
        { status: 500 }
      );
    }
  }

  if (listOnly) {
    try {
      const parentInfo = await resolveReportsParent();
      if (parentInfo.isDatabase) {
        const results = await queryDatabase(REPORTS_DB_ID, {
          sorts: [
            {
              property: parentInfo.dateKey || parentInfo.titleKey,
              direction: "descending",
            },
          ],
        });
        const rows = (results.results || []).map((page: any) => ({
          id: page.id,
          title: getPlainText(page.properties?.[parentInfo.titleKey]) ||
            page.properties?.[parentInfo.titleKey]?.title?.[0]?.plain_text ||
            "Untitled report",
          date:
            page.properties?.[parentInfo.dateKey || ""]?.date?.start ||
            page.created_time,
        }));
        return NextResponse.json({ reports: rows });
      }

      const children = await listAllBlockChildren(REPORTS_DB_ID);
      type ReportListItem = { id: string; title: string; date?: string };
      const items: ReportListItem[] = (children.results || [])
        .filter((block: any) => block.type === "child_page")
        .map((block: any) => ({
          id: block.id,
          title: block.child_page?.title || "Untitled report",
          date: block.created_time,
        }));

      items.sort((a: ReportListItem, b: ReportListItem) =>
        (b.date || "").localeCompare(a.date || "")
      );
      return NextResponse.json({ reports: items });
    } catch (err) {
      console.error("Failed to list reports:", err);
      return NextResponse.json(
        { error: "Could not load reports" },
        { status: 500 }
      );
    }
  }

  let schedule;
  try {
    schedule = await loadScheduleData();
  } catch (err) {
    console.error("Failed to load schedule for report:", err);
    return NextResponse.json(
      { error: "Unable to load schedule for reporting" },
      { status: 500 }
    );
  }
  if (!schedule.people.length || !schedule.slots.length) {
    return NextResponse.json({ status: "no-schedule" });
  }

  const resetWindowMatch =
    !!schedule.taskResetTime && isWithinWindow(schedule.taskResetTime, 15);
  const resetResult = resetWindowMatch ? await resetRecurringTasks() : null;

  const reportWindowMatch = isWithinWindow(schedule.reportTime, 15);
  if (!reportWindowMatch) {
    return NextResponse.json({
      status: "skipped-window",
      reason: "Outside configured report time window",
      taskResets: resetResult?.updated ?? 0,
    });
  }

  const parentInfo = await resolveReportsParent();
  const scheduleLabel = schedule.scheduleDate || new Date().toLocaleDateString();

  const reportAlready = await reportExists(scheduleLabel, parentInfo);
  if (reportAlready) {
    return NextResponse.json({
      status: "exists",
      taskResets: resetResult?.updated ?? 0,
    });
  }


  try {
    const page = await createReportFromSchedule(schedule);
    return NextResponse.json({
      status: "created",
      pageId: page.id,
      taskResets: resetResult?.updated ?? 0,
    });
  } catch (err) {
    console.error("Auto report creation failed:", err);
    return NextResponse.json(
      { status: "error", error: "Failed to create report" },
      { status: 500 }
    );
  }
}

export async function POST() {
  if (!REPORTS_DB_ID || !TASKS_DB_ID) {
    return NextResponse.json(
      { error: "Reports or Tasks database ID is not configured" },
      { status: 500 }
    );
  }

  let schedule;
  try {
    schedule = await loadScheduleData();
  } catch (err) {
    console.error("Failed to load schedule for report:", err);
    return NextResponse.json(
      { error: "Unable to load schedule for reporting" },
      { status: 500 }
    );
  }
  if (!schedule.people.length || !schedule.slots.length) {
    return NextResponse.json(
      { error: "No schedule has been assigned yet" },
      { status: 400 }
    );
  }

  try {
    const page = await createReportFromSchedule(schedule);
    return NextResponse.json({ success: true, pageId: page.id });
  } catch (err) {
    console.error("Failed to create report manually:", err);
    return NextResponse.json(
      { error: "Failed to create report" },
      { status: 500 }
    );
  }
}
