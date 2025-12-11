import { NextResponse } from "next/server";
import {
  createComment,
  createPageInDatabase,
  queryDatabase,
  retrieveComments,
  retrievePage,
  updatePage,
} from "@/lib/notion";

const REQUESTS_DB_ID = process.env.NOTION_REQUESTS_DATABASE_ID!;

const NAME_KEY = "Name";
const DESCRIPTION_KEY = "Description";
const USER_KEY = "User";
const STATUS_KEY = "Status";

const MAX_NAME_WORDS = 8;
const MAX_NAME_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 500;

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

function mapPageToRequest(page: any) {
  const props = page.properties || {};
  return {
    id: page.id,
    name: getPlainText(props[NAME_KEY]) || "Untitled Request",
    description: getPlainText(props[DESCRIPTION_KEY]) || "",
    user: getPlainText(props[USER_KEY]) || "Unknown",
    status: getPlainText(props[STATUS_KEY]) || "Pending",
    createdTime: page.created_time,
  };
}

function validateName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > MAX_NAME_WORDS) {
    return `Request name must be ${MAX_NAME_WORDS} words or fewer.`;
  }
  if (name.length > MAX_NAME_CHARS) {
    return `Request name must be ${MAX_NAME_CHARS} characters or fewer.`;
  }
  return "";
}

function validateDescription(description: string) {
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return `Description must be ${MAX_DESCRIPTION_CHARS} characters or fewer.`;
  }
  return "";
}

export async function GET(req: Request) {
  if (!REQUESTS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_REQUESTS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  try {
    if (id) {
      const page = await retrievePage(id);
      if (!page || page.object === "error") {
        return NextResponse.json(
          { error: "Request not found" },
          { status: 404 }
        );
      }

      const base = mapPageToRequest(page);
      const commentsRaw = await retrieveComments(id);
      const comments = (commentsRaw.results || []).map((c: any) => {
        const rawText = getPlainText(c.rich_text) || "";
        const colonIndex = rawText.indexOf(":");
        const parsedAuthor = colonIndex > -1 ? rawText.slice(0, colonIndex).trim() : "";
        const parsedMessage =
          colonIndex > -1 ? rawText.slice(colonIndex + 1).trim() : rawText;

        return {
          id: c.id,
          text: parsedMessage,
          createdTime: c.created_time,
          author: parsedAuthor || c.created_by?.name || "Unknown",
        };
      });

      return NextResponse.json({ ...base, comments });
    }

    const data = await queryDatabase(REQUESTS_DB_ID, {
      sorts: [
        {
          timestamp: "created_time",
          direction: "descending",
        },
      ],
    });

    const requests = (data.results || []).map(mapPageToRequest);
    return NextResponse.json({ requests });
  } catch (err) {
    console.error("Failed to fetch requests from Notion:", err);
    return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!REQUESTS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_REQUESTS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const { name, description, user, action, id, comment } = body || {};

  if (action === "comment") {
    if (!id || !comment || !user) {
      return NextResponse.json(
        { error: "Missing request id, comment, or user" },
        { status: 400 }
      );
    }

    try {
      const formatted = `${user} : ${comment}`;
      await createComment(id, [
        {
          type: "text",
          text: { content: formatted },
        },
      ]);

      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("Failed to add request comment:", err);
      return NextResponse.json(
        { error: "Failed to add comment" },
        { status: 500 }
      );
    }
  }

  if (!name || !description || !user) {
    return NextResponse.json(
      { error: "Missing name, description, or user" },
      { status: 400 }
    );
  }

  const nameError = validateName(name);
  const descError = validateDescription(description);

  if (nameError || descError) {
    return NextResponse.json(
      { error: nameError || descError },
      { status: 400 }
    );
  }

  try {
    const page = await createPageInDatabase(REQUESTS_DB_ID, {
      [NAME_KEY]: {
        title: [
          {
            type: "text",
            text: { content: name },
          },
        ],
      },
      [DESCRIPTION_KEY]: {
        rich_text: [
          {
            type: "text",
            text: { content: description },
          },
        ],
      },
      [USER_KEY]: {
        rich_text: [
          {
            type: "text",
            text: { content: user },
          },
        ],
      },
      [STATUS_KEY]: {
        select: { name: "Pending" },
      },
    });

    return NextResponse.json({ success: true, request: mapPageToRequest(page) });
  } catch (err) {
    console.error("Failed to create request in Notion:", err);
    return NextResponse.json(
      { error: "Failed to create request" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  if (!REQUESTS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_REQUESTS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const { id, name, description, action } = body || {};

  if (!id) {
    return NextResponse.json({ error: "Missing request id" }, { status: 400 });
  }

  try {
    const page = await retrievePage(id);
    if (!page || page.object === "error") {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const props = page.properties || {};
    const status = getPlainText(props[STATUS_KEY]);

    if (action === "cancel") {
      if (status !== "Pending") {
        return NextResponse.json(
          { error: "Only pending requests can be cancelled" },
          { status: 400 }
        );
      }

      const updated = await updatePage(id, {
        [STATUS_KEY]: { select: { name: "Denied" } },
      });

      return NextResponse.json({ success: true, request: mapPageToRequest(updated) });
    }

    if (status !== "Pending") {
      return NextResponse.json(
        { error: "Only pending requests can be edited" },
        { status: 400 }
      );
    }

    if (!name || !description) {
      return NextResponse.json(
        { error: "Missing updated name or description" },
        { status: 400 }
      );
    }

    const nameError = validateName(name);
    const descError = validateDescription(description);

    if (nameError || descError) {
      return NextResponse.json(
        { error: nameError || descError },
        { status: 400 }
      );
    }

    const updated = await updatePage(id, {
      [NAME_KEY]: {
        title: [
          {
            type: "text",
            text: { content: name },
          },
        ],
      },
      [DESCRIPTION_KEY]: {
        rich_text: [
          {
            type: "text",
            text: { content: description },
          },
        ],
      },
    });

    return NextResponse.json({ success: true, request: mapPageToRequest(updated) });
  } catch (err) {
    console.error("Failed to update request:", err);
    return NextResponse.json(
      { error: "Failed to update request" },
      { status: 500 }
    );
  }
}
