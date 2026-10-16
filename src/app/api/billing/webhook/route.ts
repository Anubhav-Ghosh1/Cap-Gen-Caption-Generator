import { NextResponse } from "next/server";
import { applyStripeEvent, verifyStripeSignature } from "@/lib/billing";

export const runtime = "nodejs";

/** Stripe → us. Point a webhook at /api/billing/webhook (events: checkout.session.completed, customer.subscription.*). */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }
  try {
    await applyStripeEvent(JSON.parse(raw));
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[billing webhook]", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}
