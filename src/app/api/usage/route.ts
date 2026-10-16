import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { getUsage, userIdOf } from "@/lib/billing";

export const runtime = "nodejs";

/** Current plan + quota for the logged-in user. */
export async function GET(req: Request) {
  const username = await getRequestUser(req);
  if (!username) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  return NextResponse.json(await getUsage(userIdOf(username)), { headers: { "cache-control": "no-store" } });
}
