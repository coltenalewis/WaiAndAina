import { POST as resetRecurring } from "../tasks/reset-recurring/route";

export async function GET() {
  return resetRecurring();
}

export async function POST() {
  return resetRecurring();
}
