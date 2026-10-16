import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const username = await getRequestUser(req);
  if (!username) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  return NextResponse.json({ user: { username } });
}
