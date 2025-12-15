import { NextResponse } from "next/server";
import {
  createPageInDatabase,
  queryAllDatabasePages,
  updatePage,
} from "@/lib/notion";

const USERS_DB_ID = process.env.NOTION_USERS_DATABASE_ID!;
const NAME_KEY = "Name";
const PASSWORD_KEY = "Password";
const USER_TYPE_KEY = "User Type";
const GOAT_DICE_KEY = "Goat Dice";
const GOAT_RUN_KEY = "Goat Run";

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

export async function GET() {
  if (!USERS_DB_ID) {
    return NextResponse.json({ error: "Users DB not configured" }, { status: 500 });
  }

  const data = await queryAllDatabasePages(USERS_DB_ID, {
    sorts: [{ property: NAME_KEY, direction: "ascending" }],
  });

  const users = (data.results || []).map((page: any) => {
    const props = page.properties || {};
    return {
      id: page.id,
      name: getPlainText(props[NAME_KEY]),
      userType: getPlainText(props[USER_TYPE_KEY]),
      goats: props[GOAT_DICE_KEY]?.number || 0,
      bestRun: props[GOAT_RUN_KEY]?.number || 0,
    };
  });

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  if (!USERS_DB_ID) {
    return NextResponse.json({ error: "Users DB not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const { name, userType, goats = 0, bestRun = 0 } = body || {};

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const properties: any = {
    [NAME_KEY]: {
      title: [{ type: "text", text: { content: name } }],
    },
    [PASSWORD_KEY]: {
      rich_text: [{ type: "text", text: { content: "WAIANDAINA" } }],
    },
    [USER_TYPE_KEY]: {
      select: userType ? { name: userType } : null,
    },
    [GOAT_DICE_KEY]: {
      number: Number(goats) || 0,
    },
    [GOAT_RUN_KEY]: {
      number: Number(bestRun) || 0,
    },
  };

  const page = await createPageInDatabase(USERS_DB_ID, properties);
  return NextResponse.json({ success: true, id: page.id });
}

export async function PATCH(req: Request) {
  if (!USERS_DB_ID) {
    return NextResponse.json({ error: "Users DB not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const { id, userType, goats, bestRun } = body || {};

  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  const properties: Record<string, any> = {};
  if (userType !== undefined) {
    properties[USER_TYPE_KEY] = { select: userType ? { name: userType } : null };
  }
  if (goats !== undefined) {
    properties[GOAT_DICE_KEY] = { number: Number(goats) || 0 };
  }
  if (bestRun !== undefined) {
    properties[GOAT_RUN_KEY] = { number: Number(bestRun) || 0 };
  }

  await updatePage(id, properties);
  return NextResponse.json({ success: true });
}
