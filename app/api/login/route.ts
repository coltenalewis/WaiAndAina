import { NextResponse } from "next/server";
import { queryDatabase } from "@/lib/notion";

const USERS_DB_ID = process.env.NOTION_USERS_DATABASE_ID!;

// These must match your Notion property names in the Users database
const NAME_PROPERTY_KEY = "Name"; // or "Name" if that is what you used
const PASSWORD_PROPERTY_KEY = "Password";
const USER_TYPE_PROPERTY_KEY = "User Type";

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
    case "multi_select":
      return (prop.multi_select || [])
        .map((s: any) => s.name || "")
        .join(", ")
        .trim();
    default:
      return "";
  }
}

export async function POST(req: Request) {
  if (!USERS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_USERS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  let body: { name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { name, password } = body;

  if (!name || !password) {
    return NextResponse.json(
      { error: "Missing name or password" },
      { status: 400 }
    );
  }

  try {
    const data = await queryDatabase(USERS_DB_ID);

    const pages = data.results || [];
    const normalizedName = name.trim().toLowerCase();
    const normalizedPass = password.trim();

    let matchFound = false;
    let matchedUserType: string | null = null;
    let matchedUserTypeColor: string | null = null;

    for (const page of pages) {
      const props = page.properties || {};
      const pageName = getPlainText(props[NAME_PROPERTY_KEY]).toLowerCase();
      const pagePass = getPlainText(props[PASSWORD_PROPERTY_KEY]);

      if (
        pageName === normalizedName &&
        pagePass === normalizedPass
      ) {
        const rawType = props[USER_TYPE_PROPERTY_KEY];
        matchedUserType = rawType ? getPlainText(rawType) : null;
        matchedUserTypeColor = rawType?.select?.color || null;
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      name,
      userType: matchedUserType,
      userTypeColor: matchedUserTypeColor,
    });
  } catch (err) {
    console.error("Login check failed:", err);
    return NextResponse.json(
      { error: "Failed to verify credentials" },
      { status: 500 }
    );
  }
}
