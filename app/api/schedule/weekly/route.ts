import { loadWeeklyScheduleData } from "@/lib/schedule-loader";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateLabel = searchParams.get("date") || undefined;

  try {
    const schedule = await loadWeeklyScheduleData({ dateLabel });
    return Response.json(schedule);
  } catch (err) {
    console.error("Failed to fetch weekly schedule:", err);
    return Response.json(
      { error: "Unable to load weekly schedule" },
      { status: 500 }
    );
  }
}
