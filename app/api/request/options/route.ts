import { NextResponse } from "next/server";
import { retrieveDatabase } from "@/lib/notion";

const REQUESTS_DB_ID = process.env.NOTION_REQUESTS_DATABASE_ID!;
const STATUS_KEY = "Status";
const REQUEST_TYPE_KEY = "Request Type";

type Option = { name: string; color: string };

const FALLBACK_STATUS: Option[] = [
  { name: "Pending", color: "yellow" },
  { name: "Approved", color: "green" },
  { name: "Denied", color: "red" },
];

export async function GET() {
  if (!REQUESTS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_REQUESTS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  try {
    const db = await retrieveDatabase(REQUESTS_DB_ID);
    const props = db?.properties || {};
    const statusProp = props[STATUS_KEY];
    const typeProp = props[REQUEST_TYPE_KEY];

    const statuses: Option[] | undefined =
      statusProp?.type === "select" && Array.isArray(statusProp.select?.options)
        ? statusProp.select.options.map((opt: any) => ({
            name: opt.name || "",
            color: opt.color || "default",
          }))
        : undefined;

    const requestTypes: Option[] | undefined =
      typeProp?.type === "select" && Array.isArray(typeProp.select?.options)
        ? typeProp.select.options.map((opt: any) => ({
            name: opt.name || "",
            color: opt.color || "default",
          }))
        : undefined;

    return NextResponse.json({
      statuses: statuses ?? FALLBACK_STATUS,
      requestTypes: requestTypes ?? [],
    });
  } catch (err) {
    console.error("Failed to load request options from Notion", err);
    return NextResponse.json({ statuses: FALLBACK_STATUS, requestTypes: [] });
  }
}
