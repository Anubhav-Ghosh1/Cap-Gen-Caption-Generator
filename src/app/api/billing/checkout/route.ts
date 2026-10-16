import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { startCheckout, userIdOf } from "@/lib/billing";
import { isPlanId } from "@/lib/plans";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const username = await getRequestUser(req);
  if (!username) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  let plan: unknown, interval: unknown;
  try {
    ({ plan, interval } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isPlanId(plan) || plan === "free") {
    return NextResponse.json({ error: "Choose a paid plan." }, { status: 400 });
  }
  try {
    const origin = process.env.APP_URL || new URL(req.url).origin;
    const { url } = await startCheckout({
      userId: userIdOf(username),
      plan,
      interval: interval === "yearly" ? "yearly" : "monthly",
      origin,
    });
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Checkout failed." }, { status: 500 });
  }
}
