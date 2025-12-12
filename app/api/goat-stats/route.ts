import { NextResponse } from "next/server";
import {
  queryAllDatabasePages,
  updatePage,
} from "@/lib/notion";

const USERS_DB_ID = process.env.NOTION_USERS_DATABASE_ID!;
const NAME_PROPERTY_KEY = "Name";
const GOAT_DICE_KEY = "Goat Dice";
const GOAT_RUN_KEY = "Goat Run";

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

function getNumber(prop: any): number {
  if (!prop) return 0;
  if (prop.type === "number") return prop.number || 0;
  return 0;
}

async function findUserPage(name: string) {
  const normalized = name.trim().toLowerCase();
  const data = await queryAllDatabasePages(USERS_DB_ID, {
    filter: {
      property: NAME_PROPERTY_KEY,
      title: {
        equals: name,
      },
    },
  });

  const pages = data.results || [];
  if (pages.length > 0) return pages[0];

  for (const page of pages) {
    const props = page.properties || {};
    const pageName = getPlainText(props[NAME_PROPERTY_KEY]);
    if (pageName.trim().toLowerCase() === normalized) return page;
  }

  const fallback = await queryAllDatabasePages(USERS_DB_ID);
  return (fallback.results || []).find((page: any) => {
    const props = page.properties || {};
    const pageName = getPlainText(props[NAME_PROPERTY_KEY]);
    return pageName.trim().toLowerCase() === normalized;
  });
}

async function loadStats() {
  const data = await queryAllDatabasePages(USERS_DB_ID, {
    sorts: [
      {
        property: NAME_PROPERTY_KEY,
        direction: "ascending",
      },
    ],
  });

  const users = (data.results || []).map((page: any) => {
    const props = page.properties || {};
    const name = getPlainText(props[NAME_PROPERTY_KEY]);
    const goats = getNumber(props[GOAT_DICE_KEY]);
    const bestRun = getNumber(props[GOAT_RUN_KEY]);
    return { name, goats, bestRun };
  });

  const goatLeaderboard = [...users]
    .sort((a, b) => b.goats - a.goats)
    .slice(0, 10);

  const runLeaderboard = [...users]
    .sort((a, b) => b.bestRun - a.bestRun)
    .slice(0, 10);

  return { users, goatLeaderboard, runLeaderboard };
}

export async function GET() {
  if (!USERS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_USERS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  try {
    const { goatLeaderboard, runLeaderboard, users } = await loadStats();
    return NextResponse.json({
      goatLeaderboard,
      runLeaderboard,
      users,
    });
  } catch (err) {
    console.error("Failed to load goat stats:", err);
    return NextResponse.json(
      { error: "Failed to load goat stats" },
      { status: 500 }
    );
  }
}

type RunBody = {
  name?: string;
  score?: number;
};

type DiceBody = {
  name?: string;
  betType?: "LOW" | "SEVEN" | "HIGH";
  betAmount?: number;
};

export async function POST(req: Request) {
  if (!USERS_DB_ID) {
    return NextResponse.json(
      { error: "NOTION_USERS_DATABASE_ID is not set" },
      { status: 500 }
    );
  }

  let body: RunBody & DiceBody & { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, name } = body;

  if (!name) {
    return NextResponse.json({ error: "Missing user name" }, { status: 400 });
  }

  try {
    const page = await findUserPage(name);
    if (!page) {
      return NextResponse.json(
        { error: "User not found in Notion" },
        { status: 404 }
      );
    }

    const props = page.properties || {};
    const currentGoats = getNumber(props[GOAT_DICE_KEY]);
    const currentBest = getNumber(props[GOAT_RUN_KEY]);

    if (action === "run") {
      const score = Number(body.score || 0);
      if (!Number.isFinite(score) || score < 0) {
        return NextResponse.json({ error: "Invalid score" }, { status: 400 });
      }

      const earned = Math.max(0, Math.floor(score / 200));
      const nextBest = Math.max(currentBest, Math.floor(score));
      const nextGoats = currentGoats + earned;

      await updatePage(page.id, {
        [GOAT_DICE_KEY]: { number: nextGoats },
        [GOAT_RUN_KEY]: { number: nextBest },
      });

      const { goatLeaderboard, runLeaderboard } = await loadStats();

      return NextResponse.json({
        goats: nextGoats,
        bestRun: nextBest,
        earned,
        goatLeaderboard,
        runLeaderboard,
      });
    }

    if (action === "dice") {
      const betAmount = Math.max(1, Math.floor(Number(body.betAmount || 0)));
      const betType = (body.betType || "LOW") as DiceBody["betType"];

      if (betAmount <= 0) {
        return NextResponse.json({ error: "Bet must be positive" }, { status: 400 });
      }

      if (betAmount > currentGoats) {
        return NextResponse.json({ error: "Not enough goats" }, { status: 400 });
      }

      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      const sum = die1 + die2;

      const wins =
        (betType === "LOW" && sum >= 2 && sum <= 6) ||
        (betType === "SEVEN" && sum === 7) ||
        (betType === "HIGH" && sum >= 8 && sum <= 12);

      const multiplier = betType === "SEVEN" ? 5 : 2;
      const payout = wins ? betAmount * multiplier : 0;
      const nextGoats = currentGoats - betAmount + payout;

      await updatePage(page.id, {
        [GOAT_DICE_KEY]: { number: nextGoats },
      });

      const { goatLeaderboard, runLeaderboard } = await loadStats();

      return NextResponse.json({
        goats: nextGoats,
        roll: [die1, die2],
        sum,
        payout,
        win: wins,
        betAmount,
        betType,
        goatLeaderboard,
        runLeaderboard,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Failed to update goat stats:", err);
    return NextResponse.json(
      { error: "Failed to update goat stats" },
      { status: 500 }
    );
  }
}
