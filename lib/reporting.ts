import {
  createPageInDatabase,
  createPageUnderPage,
  listAllBlockChildren,
  queryDatabase,
  retrieveDatabase,
  retrievePage,
  retrieveComments,
} from "./notion";
import { loadScheduleData, Slot, ScheduleData } from "./schedule-loader";

const REPORTS_DB_ID = process.env.NOTION_REPORTS_DATABASE_ID!;
const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID!;

const TASK_NAME_PROPERTY_KEY = "Name";
const TASK_STATUS_PROPERTY_KEY = "Status";
const TASK_DESC_PROPERTY_KEY = "Description";
const TASK_NOTES_PROPERTY_KEY = "Extra Notes";

export type ReportParentInfo = {
  isDatabase: boolean;
  meta: any | null;
  titleKey: string;
  dateKey: string | null;
};

export type ReportCreationStatus =
  | { status: "no-schedule" }
  | { status: "exists" }
  | { status: "no-auto-time" }
  | { status: "pending"; nextRun: string }
  | { status: "created"; pageId: string }
  | { status: "error"; error: string };

type TaskDetail = {
  name: string;
  status: string;
  description: string;
  extraNotes: string;
  comments: { author: string; text: string; createdTime: string }[];
};

type Assignment = { person: string; slot: Slot; taskName: string };

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

function baseTaskName(task: string) {
  return (task || "").split("\n")[0].trim();
}

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

export function formatHawaiiClock(dateInput?: string) {
  if (!dateInput) return "";
  const dt = new Date(dateInput);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Pacific/Honolulu",
    });
  }

  const match = dateInput.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridian = match[3]?.toLowerCase();

  if (meridian === "pm" && hours < 12) hours += 12;
  if (meridian === "am" && hours === 12) hours = 0;

  return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
}

function nowHawaiiClock(now: Date = new Date()) {
  return now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Pacific/Honolulu",
  });
}

export async function resolveReportsParent(): Promise<ReportParentInfo> {
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

export async function reportExists(
  scheduleLabel: string,
  parentInfo: ReportParentInfo
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

export async function createReportFromSchedule(
  schedule: ScheduleData,
  parentInfo?: ReportParentInfo
) {
  const assignments = buildAssignments(
    schedule.people,
    schedule.slots,
    schedule.cells
  );

  const uniqueTasks = Array.from(
    new Set(assignments.map((a) => baseTaskName(a.taskName)).filter(Boolean))
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

  const resolvedParent = parentInfo || (await resolveReportsParent());
  const scheduleLabel = schedule.scheduleDate || new Date().toLocaleDateString();
  const isoDate = toIso(schedule.scheduleDate);

  const children: any[] = [
    heading(`Daily Report — ${scheduleLabel}`, 2),
    paragraph(
      `Generated ${new Date().toLocaleString()} with ${assignments.length} assignments.`
    ),
  ];

  if (assignments.length === 0) {
    children.push(paragraph("No assignments were recorded for this schedule."));
  } else {
    schedule.slots.forEach((slot: Slot) => {
      const slotAssignments = assignments.filter((a) => a.slot.id === slot.id);
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
          detailChildren.push(
            bullet(
              `Comments (${comments.length}):`,
              comments.map((c) =>
                bullet(
                  `${c.author ? `${c.author}: ` : ""}${c.text} (${new Date(
                    c.createdTime
                  ).toLocaleString()})`
                )
              )
            )
          );
        }

        children.push(
          bullet(
            `${assignment.person} — ${assignment.taskName}${statusLabel}`,
            detailChildren
          )
        );
      });
    });
  }

  const properties = resolvedParent.isDatabase
    ? {
        [resolvedParent.titleKey]: {
          title: [
            {
              type: "text",
              text: { content: `Daily Report — ${scheduleLabel}` },
            },
          ],
        },
        ...(resolvedParent.dateKey
          ? {
              [resolvedParent.dateKey]: {
                date: { start: isoDate },
              },
            }
          : {}),
      }
    : {
        title: [
          {
            type: "text",
            text: { content: `Daily Report — ${scheduleLabel}` },
          },
        ],
      };

  if (resolvedParent.isDatabase) {
    return createPageInDatabase(REPORTS_DB_ID, properties, children);
  }

  return createPageUnderPage(REPORTS_DB_ID, properties, children);
}

export async function createReportIfScheduled(
  schedule?: ScheduleData,
  now: Date = new Date(),
  parentInfo?: ReportParentInfo
): Promise<ReportCreationStatus> {
  if (!schedule) {
    try {
      schedule = await loadScheduleData();
    } catch (err) {
      console.error("Failed to load schedule for auto-report:", err);
      return { status: "error", error: "Unable to load schedule" };
    }
  }

  if (!schedule.people.length || !schedule.slots.length) {
    return { status: "no-schedule" };
  }

  const resolvedParent = parentInfo || (await resolveReportsParent());
  const scheduleLabel = schedule.scheduleDate || now.toLocaleDateString();

  if (await reportExists(scheduleLabel, resolvedParent)) {
    return { status: "exists" };
  }

  const scheduleHSTTime = formatHawaiiClock(schedule.reportTime);
  if (!scheduleHSTTime) {
    return { status: "no-auto-time" };
  }

  const currentHawaii = nowHawaiiClock(now);
  if (currentHawaii < scheduleHSTTime) {
    return { status: "pending", nextRun: scheduleHSTTime };
  }

  try {
    const page = await createReportFromSchedule(schedule, resolvedParent);
    return { status: "created", pageId: page.id };
  } catch (err) {
    console.error("Auto report creation failed:", err);
    return { status: "error", error: "Failed to create report" };
  }
}
