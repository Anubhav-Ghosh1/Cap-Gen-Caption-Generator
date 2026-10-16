import { NextResponse } from "next/server";
import { COOKIE_MAX_AGE_S, COOKIE_NAME, createSession, verifyUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = String(body.username || "").trim();
    password = String(body.password || "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const verified = await verifyUser(username, password);
  if (!verified) {
    return NextResponse.json({ error: "Invalid username/email or password." }, { status: 401 });
  }

  const token = await createSession(verified);
  const res = NextResponse.json({ user: { username: verified } });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return res;
}
