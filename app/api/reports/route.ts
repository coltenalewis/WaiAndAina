import { NextResponse } from "next/server";
import {
  listAllBlockChildren,
  queryDatabase,
  retrievePage,
} from "@/lib/notion";
import { createReportIfScheduled, createReportFromSchedule, resolveReportsParent } from "@/lib/reporting";
import { loadScheduleData } from "@/lib/schedule-loader";

const REPORTS_DB_ID = process.env.NOTION_REPORTS_DATABASE_ID!;
const TASKS_DB_ID = process.env.NOTION_TASKS_DATABASE_ID!;

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
  const result = await createReportIfScheduled(schedule);

  switch (result.status) {
    case "no-schedule":
      return NextResponse.json({ status: "no-schedule" });
    case "exists":
      return NextResponse.json({ status: "exists" });
    case "no-auto-time":
      return NextResponse.json({ status: "no-auto-time" });
    case "pending":
      return NextResponse.json({ status: "pending", nextRun: result.nextRun });
    case "created":
      return NextResponse.json({ status: "created", pageId: result.pageId });
    default:
      return NextResponse.json(
        { status: "error", error: (result as any).error || "Failed to create report" },
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
