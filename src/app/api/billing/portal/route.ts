import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { startPortal, userIdOf } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const username = await getRequestUser(req);
  if (!username) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  try {
    const origin = process.env.APP_URL || new URL(req.url).origin;
    return NextResponse.json(await startPortal(userIdOf(username), origin));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open billing." }, { status: 400 });
  }
}
