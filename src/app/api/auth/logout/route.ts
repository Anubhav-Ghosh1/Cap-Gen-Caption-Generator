import { NextResponse } from "next/server";
import { COOKIE_NAME, destroySession, tokenFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const token = tokenFromRequest(req);
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
