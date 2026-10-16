import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { consumeVideo, userIdOf } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * Spend one video from the quota. Called by the studio right before it starts
 * transcribing. 402 = quota exhausted → client sends the user to /pricing.
 */
export async function POST(req: Request) {
  const username = await getRequestUser(req);
  if (!username) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  let body: { fileName?: unknown; durationS?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const { allowed, usage } = await consumeVideo(userIdOf(username), {
    fileName: typeof body.fileName === "string" ? body.fileName : undefined,
    durationS: typeof body.durationS === "number" ? body.durationS : undefined,
  });

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          usage.plan === "free"
            ? `You've used all ${usage.limit} free videos. Upgrade to keep captioning.`
            : `You've reached this month's ${usage.limit}-video limit on the ${usage.planName} plan.`,
        usage,
      },
      { status: 402 }
    );
  }
  return NextResponse.json({ usage });
}
