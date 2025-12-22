import { POST as createReport } from "../reports/route";

export async function GET() {
  return createReport();
}

export async function POST() {
  return createReport();
}
