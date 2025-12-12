import { NextResponse } from "next/server";
import { queryDatabase, updatePage } from "@/lib/notion";

const USERS_DB_ID = process.env.NOTION_USERS_DATABASE_ID!;
const NAME_PROPERTY_KEY = "Name";
const ONLINE_PROPERTY_KEY = "Online";
const LAST_ACTIVE_PROPERTY_KEY = "Last Active";

export async function POST(req: Request) {
  if (!USERS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_USERS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  let body: { name?: string; offline?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, offline = false } = body;
  if (!name) {
    return NextResponse.json(
      { error: "Missing user name for heartbeat" },
      { status: 400 }
    );
  }

  try {
    const data = await queryDatabase(USERS_DB_ID, {
      filter: {
        property: NAME_PROPERTY_KEY,
        title: { equals: name },
      },
      page_size: 1,
    });

    const page = data.results?.[0];
    if (!page) {
      return NextResponse.json({ ok: true });
    }

    const properties: Record<string, any> = {
      [ONLINE_PROPERTY_KEY]: { checkbox: !offline },
      [LAST_ACTIVE_PROPERTY_KEY]: {
        date: { start: new Date().toISOString() },
      },
    };

    await updatePage(page.id, properties);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to record heartbeat:", err);
    return NextResponse.json(
      { error: "Failed to record heartbeat" },
      { status: 500 }
    );
  }
}
