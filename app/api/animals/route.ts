import { NextResponse } from "next/server";
import { queryDatabase, retrieveDatabase } from "@/lib/notion";

const ANIMALS_DB_ID = process.env.NOTION_ANIMALS_DATABASE_ID;

const NAME_KEY = "Animal Name";
const SUMMARY_KEY = "Summary";
const BIRTHDAY_KEY = "Birthday";
const MILKING_METHOD_KEY = "Milking Method";
const GET_MILKED_KEY = "Get Milked";
const TYPE_KEY = "Type";
const BEHAVIORS_KEY = "Behaviors";
const BREED_KEY = "Breed";
const GENDER_KEY = "Gender";
const PHOTO_KEY = "Photo";
const DAILY_CARE_NOTES_KEY = "Daily Care Notes";
const PAGE_SIZE = 50;

function formatAgeInfo(dateString?: string) {
  if (!dateString) return { label: "", months: null as number | null };
  const birthday = new Date(dateString);
  if (Number.isNaN(birthday.getTime())) {
    return { label: "", months: null as number | null };
  }

  const now = new Date();
  let months =
    (now.getFullYear() - birthday.getFullYear()) * 12 +
    (now.getMonth() - birthday.getMonth());
  const dayDiff = now.getDate() - birthday.getDate();
  if (dayDiff < 0) {
    months -= 1;
  }

  if (months < 0) months = 0;

  if (months >= 24) {
    const years = Math.floor(months / 12);
    return { label: `${years} year${years === 1 ? "" : "s"}`, months };
  }

  if (months >= 12) {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    const parts = [`${years} year${years === 1 ? "" : "s"}`];
    if (remainingMonths > 0) {
      parts.push(`${remainingMonths} month${remainingMonths === 1 ? "" : "s"}`);
    }
    return { label: parts.join(" "), months };
  }

  return { label: `${months} month${months === 1 ? "" : "s"}`, months };
}

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
    case "url":
      return prop.url || "";
    default:
      return "";
  }
}

export async function GET(request: Request) {
  if (!ANIMALS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_ANIMALS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") || undefined;
    const pageSizeParam = Number(searchParams.get("pageSize"));
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(pageSizeParam, 100)
        : PAGE_SIZE;

    const [dbMeta, result] = await Promise.all([
      cursor ? Promise.resolve(null) : retrieveDatabase(ANIMALS_DB_ID),
      queryDatabase(ANIMALS_DB_ID, {
        page_size: pageSize,
        start_cursor: cursor,
      }),
    ]);

    const typeOptions: { name: string; color?: string }[] =
      dbMeta?.properties?.[TYPE_KEY]?.select?.options?.map((opt: any) => ({
        name: opt.name,
        color: opt.color,
      })) || [];
    const genderOptions: { name: string; color?: string }[] =
      dbMeta?.properties?.[GENDER_KEY]?.select?.options?.map((opt: any) => ({
        name: opt.name,
        color: opt.color,
      })) || [];

    const animals = (result.results || []).map((page: any) => {
      const props = page.properties || {};
      const name = getPlainText(props[NAME_KEY]);
      const summary = getPlainText(props[SUMMARY_KEY]);
      const dailyCareNotes = getPlainText(props[DAILY_CARE_NOTES_KEY]);
      const birthday = props[BIRTHDAY_KEY]?.date?.start || "";
      const { label: ageLabel, months: ageMonths } = formatAgeInfo(birthday);
      const milkingMethod = getPlainText(props[MILKING_METHOD_KEY]);
      const getMilked = Boolean(props[GET_MILKED_KEY]?.checkbox);
      const typeProp = props[TYPE_KEY];
      const type =
        typeProp?.type === "select"
          ? { name: typeProp.select?.name || "", color: typeProp.select?.color }
          : { name: "", color: undefined };
      const behaviors = (props[BEHAVIORS_KEY]?.multi_select || []).map(
        (b: any) => b.name || ""
      );
      const breed = getPlainText(props[BREED_KEY]);
      const genderProp = props[GENDER_KEY];
      const gender =
        genderProp?.type === "select"
          ? { name: genderProp.select?.name || "", color: genderProp.select?.color }
          : { name: "", color: undefined };

      const photosProp = props[PHOTO_KEY];
      const photos =
        photosProp?.type === "files"
          ? (photosProp.files || []).map((f: any) => ({
              name: f.name || "Photo",
              url: f.external?.url || f.file?.url || "",
            }))
          : [];

      return {
        id: page.id,
        name,
        summary,
        birthday,
        ageLabel,
        ageMonths,
        milkingMethod,
        getMilked,
        type,
        behaviors: behaviors.filter(Boolean),
        breed,
        gender,
        photos,
        dailyCareNotes,
      };
    });

    return NextResponse.json({
      animals,
      filters: dbMeta
        ? {
            types: typeOptions,
            genders: genderOptions,
          }
        : undefined,
      hasMore: Boolean(result.has_more),
      nextCursor: result.next_cursor ?? null,
    });
  } catch (err) {
    console.error("Failed to fetch animal data:", err);
    return NextResponse.json(
      { error: "Failed to fetch animals" },
      { status: 500 }
    );
  }
}
