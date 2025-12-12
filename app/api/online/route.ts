import { NextResponse } from "next/server";
import { queryDatabase, updatePage } from "@/lib/notion";

const USERS_DB_ID = process.env.NOTION_USERS_DATABASE_ID!;
const NAME_PROPERTY_KEY = "Name";
const ONLINE_PROPERTY_KEY = "Online";
const LAST_ACTIVE_PROPERTY_KEY = "Last Active";
const ONLINE_TIMEOUT_MS = 60_000;

function getPlainText(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") {
    return (prop.title || [])
      .map((t: any) => t.plain_text || "")
      .join("")
      .trim();
  }
  if (prop.type === "rich_text") {
    return (prop.rich_text || [])
      .map((t: any) => t.plain_text || "")
      .join("")
      .trim();
  }
  return "";
}

export async function GET() {
  if (!USERS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_USERS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  try {
    const data = await queryDatabase(USERS_DB_ID, {
      sorts: [
        {
          property: NAME_PROPERTY_KEY,
          direction: "ascending",
        },
      ],
    });

    const now = Date.now();
    const updates: Promise<any>[] = [];

    const users: { name: string; online: boolean; lastActive: string | null }[] =
      (data.results || []).map((page: any) => {
      const props = page.properties || {};
      const name = getPlainText(props[NAME_PROPERTY_KEY]);
      const online = !!props[ONLINE_PROPERTY_KEY]?.checkbox;
      const lastActiveRaw = props[LAST_ACTIVE_PROPERTY_KEY]?.date?.start;
      const lastActive = lastActiveRaw ? new Date(lastActiveRaw).getTime() : 0;

      const isFresh = lastActive && now - lastActive <= ONLINE_TIMEOUT_MS;
      const isOnline = online && isFresh;

      if (online && !isFresh) {
        updates.push(
          updatePage(page.id, {
            [ONLINE_PROPERTY_KEY]: { checkbox: false },
          })
        );
      }

      return {
        name,
        online: isOnline,
        lastActive: lastActiveRaw || null,
      };
    });

    if (updates.length) {
      Promise.allSettled(updates).catch((err) =>
        console.error("Failed to reconcile online statuses:", err)
      );
    }

    const onlineUsers = users
      .filter((user) => user.online)
      .map((user) => user.name);

    return NextResponse.json({
      users,
      onlineUsers,
    });
  } catch (err) {
    console.error("Failed to load online users:", err);
    return NextResponse.json(
      { error: "Failed to load online users" },
      { status: 500 }
    );
  }
}
