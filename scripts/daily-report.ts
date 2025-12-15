import { createReportIfScheduled, type ReportCreationStatus } from "../lib/reporting";
import { loadScheduleData } from "../lib/schedule-loader";

async function main() {
  const schedule = await loadScheduleData();
  const result: ReportCreationStatus = await createReportIfScheduled(schedule);

  switch (result.status) {
    case "created":
      console.log(`Daily report created: ${result.pageId}`);
      break;
    case "pending":
      console.log(`Report time has not arrived yet. Next run at ${result.nextRun}.`);
      break;
    case "exists":
      console.log("Report already exists for the current schedule.");
      break;
    case "no-schedule":
      console.log("No schedule assigned; skipping auto-report.");
      break;
    case "no-auto-time":
      console.log("No report time configured; skipping auto-report.");
      break;
    case "error":
      console.error(`Auto-report failed: ${result.error}`);
      process.exitCode = 1;
      break;
    default:
      console.error(`Auto-report failed: unexpected status ${(result as never).status}`);
      process.exitCode = 1;
      break;
  }
}

main().catch((err) => {
  console.error("Unexpected failure while creating scheduled report:", err);
  process.exitCode = 1;
});
