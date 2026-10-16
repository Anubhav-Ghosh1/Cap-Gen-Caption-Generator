import { NextResponse } from "next/server";
import { COOKIE_MAX_AGE_S, COOKIE_NAME, createSession, createUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let username = "";
  let password = "";
  let email = "";
  try {
    const body = await req.json();
    username = String(body.username || "").trim();
    password = String(body.password || "");
    email = String(body.email || "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    await createUser(username, password, email);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create account." },
      { status: 400 }
    );
  }

  const token = await createSession(username);
  const res = NextResponse.json({ user: { username } });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return res;
}
