import { NextResponse } from "next/server";
import {
  listBlockChildren,
  retrievePage,
} from "@/lib/notion";

const DEFAULT_GUIDES_ROOT = "2c6787efa6ee80bdb078d23c5680c353";
const GUIDES_ROOT_PAGE_ID =
  process.env.NOTION_GUIDES_ROOT_PAGE_ID || DEFAULT_GUIDES_ROOT;

type RichTextNode = {
  plain: string;
  href?: string;
  annotations?: any;
};

type GuideBlock = {
  id: string;
  type: string;
  richText?: RichTextNode[];
  checked?: boolean;
  url?: string;
  caption?: RichTextNode[];
  children?: GuideBlock[];
};

function mapRichText(richText: any[] = []): RichTextNode[] {
  return richText.map((t: any) => ({
    plain: t.plain_text || "",
    href: t.href || undefined,
    annotations: t.annotations || {},
  }));
}

async function fetchChildPages(parentId: string) {
  const pages: { id: string; title: string; lastEdited: string }[] = [];
  let cursor: string | undefined;

  do {
    const data = await listBlockChildren(parentId, cursor);
    (data.results || []).forEach((block: any) => {
      if (block.type === "child_page") {
        pages.push({
          id: block.id,
          title: block.child_page?.title || "Untitled Guide",
          lastEdited: block.last_edited_time,
        });
      }
    });
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

async function buildBlocks(blockId: string): Promise<GuideBlock[]> {
  const data = await listBlockChildren(blockId);
  const blocks = await Promise.all(
    (data.results || []).map(async (block: any) => {
      let children: GuideBlock[] = [];
      if (block.has_children) {
        children = await buildBlocks(block.id);
      }

      switch (block.type) {
        case "paragraph":
          return {
            id: block.id,
            type: "paragraph",
            richText: mapRichText(block.paragraph?.rich_text),
            children,
          } as GuideBlock;
        case "heading_1":
        case "heading_2":
        case "heading_3":
          return {
            id: block.id,
            type: block.type,
            richText: mapRichText(block[block.type]?.rich_text),
            children,
          } as GuideBlock;
        case "bulleted_list_item":
        case "numbered_list_item":
          return {
            id: block.id,
            type: block.type,
            richText: mapRichText(block[block.type]?.rich_text),
            children,
          } as GuideBlock;
        case "to_do":
          return {
            id: block.id,
            type: "to_do",
            richText: mapRichText(block.to_do?.rich_text),
            checked: !!block.to_do?.checked,
            children,
          } as GuideBlock;
        case "quote":
        case "callout":
          return {
            id: block.id,
            type: block.type,
            richText: mapRichText(block[block.type]?.rich_text),
            children,
          } as GuideBlock;
        case "bookmark":
          return {
            id: block.id,
            type: "bookmark",
            url: block.bookmark?.url,
            caption: mapRichText(block.bookmark?.caption),
            children,
          } as GuideBlock;
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
          } as GuideBlock;
        }
        case "divider":
          return { id: block.id, type: "divider" } as GuideBlock;
        case "child_page":
          // skip child page blocks here; they are handled in the listing
          return null;
        default:
          return {
            id: block.id,
            type: "unsupported",
            richText: mapRichText(block[block.type]?.rich_text || []),
            children,
          } as GuideBlock;
      }
    })
  );

  return blocks.filter(Boolean) as GuideBlock[];
}

export async function GET(req: Request) {
  if (!GUIDES_ROOT_PAGE_ID) {
    return NextResponse.json(
      { error: "NOTION_GUIDES_ROOT_PAGE_ID is not set" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  try {
    if (id) {
      const page = await retrievePage(id);
      if (!page || page.object === "error") {
        return NextResponse.json({ error: "Guide not found" }, { status: 404 });
      }

      const blocks = await buildBlocks(id);
      const title =
        page.properties?.title?.title?.[0]?.plain_text || page.properties?.Name?.title?.[0]?.plain_text;

      return NextResponse.json({
        guide: {
          id,
          title: title || "Untitled Guide",
          lastEdited: page.last_edited_time,
        },
        blocks,
      });
    }

    const guides = await fetchChildPages(GUIDES_ROOT_PAGE_ID);
    return NextResponse.json({ guides });
  } catch (err) {
    console.error("Failed to fetch guides from Notion:", err);
    return NextResponse.json(
      { error: "Failed to fetch guides" },
      { status: 500 }
    );
  }
}
