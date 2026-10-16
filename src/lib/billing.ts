/**
 * Server-side plans, quota enforcement and billing (Stripe over plain REST —
 * no SDK dependency). A "mock" provider lets the whole flow be exercised in
 * development without Stripe keys.
 *
 * Env:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *   STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY
 *   STRIPE_PRICE_STUDIO_MONTHLY, STRIPE_PRICE_STUDIO_YEARLY
 *   APP_URL                       (e.g. https://captionai.vercel.app)
 *   BILLING_MODE=mock             (force mock checkout; default in dev w/o keys)
 */

import crypto from "crypto";
import { db } from "./db";
import { FREE_LIFETIME_VIDEOS, PLANS, isPlanId, type BillingInterval, type PlanId } from "./plans";
import type {
  BillingEventDoc,
  SubscriptionDoc,
  SubscriptionStatus,
  UsageDoc,
  UsageEventDoc,
  UserDoc,
} from "./schema";

export const userIdOf = (username: string) => username.toLowerCase();

// ---------------------------------------------------------------- plan lookup

const LIVE_STATUSES: SubscriptionStatus[] = ["active", "trialing", "past_due"];
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export async function getSubscription(userId: string): Promise<SubscriptionDoc | null> {
  return (await db()).collection<SubscriptionDoc>("subscriptions").findOne({ _id: userId });
}

function effectivePlan(sub: SubscriptionDoc | null): PlanId {
  if (!sub || !LIVE_STATUSES.includes(sub.status)) return "free";
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() + GRACE_MS < Date.now()) return "free";
  return sub.plan;
}

function currentPeriod(plan: PlanId, now = new Date()): string {
  if (PLANS[plan].period === "lifetime") return "lifetime";
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------- usage

export interface UsageSummary {
  plan: PlanId;
  planName: string;
  used: number;
  limit: number;
  remaining: number;
  period: "lifetime" | "month";
  ads: boolean;
  qualities: string[];
  status?: SubscriptionStatus;
  renewsAt?: string;
  cancelAtPeriodEnd?: boolean;
  email?: string;
}

export async function getUsage(userId: string): Promise<UsageSummary> {
  const d = await db();
  const [sub, user] = await Promise.all([
    getSubscription(userId),
    d.collection<UserDoc>("users").findOne({ _id: userId }, { projection: { email: 1 } }),
  ]);
  const plan = effectivePlan(sub);
  const cfg = PLANS[plan];
  const row = await d.collection<UsageDoc>("usage").findOne({ _id: `${userId}:${currentPeriod(plan)}` });
  const used = row?.videos ?? 0;
  return {
    plan,
    planName: cfg.name,
    used,
    limit: cfg.videos,
    remaining: Math.max(0, cfg.videos - used),
    period: cfg.period,
    ads: cfg.ads,
    qualities: cfg.qualities,
    status: sub?.status,
    renewsAt: sub?.currentPeriodEnd?.toISOString(),
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd,
    email: user?.email,
  };
}

/**
 * Atomically spend one video from the user's quota. The $lt guard lives in the
 * update filter, so parallel requests can never exceed the limit; at the limit
 * the upsert collides on _id (E11000) and we report "not allowed".
 */
export async function consumeVideo(
  userId: string,
  meta: { fileName?: string; durationS?: number } = {}
): Promise<{ allowed: boolean; usage: UsageSummary }> {
  const d = await db();
  const sub = await getSubscription(userId);
  const plan = effectivePlan(sub);
  const limit = PLANS[plan].videos;
  const period = currentPeriod(plan);
  const now = new Date();

  let allowed = true;
  try {
    await d.collection<UsageDoc>("usage").findOneAndUpdate(
      { _id: `${userId}:${period}`, videos: { $lt: limit } },
      { $inc: { videos: 1 }, $set: { updatedAt: now }, $setOnInsert: { userId, period } },
      { upsert: true }
    );
  } catch (err) {
    if ((err as { code?: number }).code === 11000) allowed = false;
    else throw err;
  }

  if (allowed) {
    const ev: UsageEventDoc = {
      userId,
      at: now,
      plan,
      period,
      fileName: meta.fileName?.slice(0, 200),
      durationS: meta.durationS,
    };
    d.collection<UsageEventDoc>("usage_events").insertOne(ev).catch(() => {});
  }
  return { allowed, usage: await getUsage(userId) };
}

// -------------------------------------------------------------- subscriptions

async function upsertSubscription(userId: string, patch: Partial<SubscriptionDoc> & Pick<SubscriptionDoc, "plan" | "interval">) {
  const now = new Date();
  await (await db()).collection<SubscriptionDoc>("subscriptions").updateOne(
    { _id: userId },
    {
      $set: { status: "active", provider: "stripe", ...patch, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}

// ------------------------------------------------------------------- checkout

export function billingMode(): "stripe" | "mock" | "off" {
  if (process.env.BILLING_MODE === "mock") return "mock";
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  return process.env.NODE_ENV === "production" ? "off" : "mock";
}

function priceIdFor(plan: PlanId, interval: BillingInterval): string | undefined {
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`];
}

async function stripe(path: string, params: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Stripe request failed.");
  return json as Record<string, any>;
}

export async function startCheckout(opts: {
  userId: string;
  plan: Exclude<PlanId, "free">;
  interval: BillingInterval;
  origin: string;
}): Promise<{ url: string }> {
  const { userId, plan, interval, origin } = opts;
  const mode = billingMode();

  if (mode === "off") throw new Error("Billing is not configured yet.");

  if (mode === "mock") {
    const end = new Date(Date.now() + (interval === "yearly" ? 365 : 30) * 86_400_000);
    await upsertSubscription(userId, {
      plan,
      interval,
      provider: "mock",
      status: "active",
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
    });
    return { url: `${origin}/pricing?checkout=success` };
  }

  const price = priceIdFor(plan, interval);
  if (!price) throw new Error(`Missing Stripe price id for ${plan}/${interval}.`);

  const d = await db();
  const user = await d.collection<UserDoc>("users").findOne({ _id: userId }, { projection: { email: 1 } });
  const existing = await getSubscription(userId);

  const p = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    client_reference_id: userId,
    "metadata[userId]": userId,
    "metadata[plan]": plan,
    "metadata[interval]": interval,
    "subscription_data[metadata][userId]": userId,
    "subscription_data[metadata][plan]": plan,
    "subscription_data[metadata][interval]": interval,
    allow_promotion_codes: "true",
  });
  if (existing?.customerId) p.set("customer", existing.customerId);
  else if (user?.email) p.set("customer_email", user.email);

  const session = await stripe("checkout/sessions", p);
  return { url: String(session.url) };
}

/** Where a subscriber manages / cancels their plan. */
export async function startPortal(userId: string, origin: string): Promise<{ url: string }> {
  const sub = await getSubscription(userId);
  if (!sub) throw new Error("You don't have a paid plan.");

  if (sub.provider === "mock") {
    await (await db()).collection<SubscriptionDoc>("subscriptions").updateOne(
      { _id: userId },
      { $set: { status: "canceled", cancelAtPeriodEnd: false, updatedAt: new Date() } }
    );
    return { url: `${origin}/pricing?checkout=cancelled-plan` };
  }
  if (!sub.customerId) throw new Error("No billing profile found.");
  const s = await stripe(
    "billing_portal/sessions",
    new URLSearchParams({ customer: sub.customerId, return_url: `${origin}/pricing` })
  );
  return { url: String(s.url) };
}

// -------------------------------------------------------------------- webhook

/** Verify Stripe's `stripe-signature` header (HMAC-SHA256, 5 min tolerance). */
export function verifyStripeSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    })
  );
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const given = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  return given.some(
    (sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  incomplete_expired: "canceled",
};

export async function applyStripeEvent(event: { id: string; type: string; data: { object: any } }) {
  const d = await db();
  // idempotency: Stripe retries — process each event id once
  try {
    await d.collection<BillingEventDoc>("billing_events").insertOne({ _id: event.id, type: event.type, at: new Date() });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return;
    throw err;
  }

  const obj = event.data.object;
  const subs = d.collection<SubscriptionDoc>("subscriptions");

  if (event.type === "checkout.session.completed") {
    const userId = obj.client_reference_id || obj.metadata?.userId;
    const plan = obj.metadata?.plan;
    if (!userId || !isPlanId(plan) || plan === "free") return;
    await upsertSubscription(userId, {
      plan,
      interval: obj.metadata?.interval === "yearly" ? "yearly" : "monthly",
      status: "active",
      provider: "stripe",
      customerId: obj.customer || undefined,
      subscriptionId: obj.subscription || undefined,
    });
    return;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const byMeta = obj.metadata?.userId as string | undefined;
    const existing =
      (byMeta && (await subs.findOne({ _id: byMeta }))) ||
      (await subs.findOne({ subscriptionId: obj.id })) ||
      (await subs.findOne({ customerId: obj.customer }));
    const userId = byMeta || existing?._id;
    const plan = obj.metadata?.plan ?? existing?.plan;
    if (!userId || !isPlanId(plan) || plan === "free") return;

    const endSec: number | undefined = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
    await upsertSubscription(userId, {
      plan,
      interval: obj.metadata?.interval === "yearly" ? "yearly" : (existing?.interval ?? "monthly"),
      status: event.type.endsWith(".deleted") ? "canceled" : (STATUS_MAP[obj.status] ?? "canceled"),
      provider: "stripe",
      customerId: obj.customer,
      subscriptionId: obj.id,
      currentPeriodEnd: endSec ? new Date(endSec * 1000) : existing?.currentPeriodEnd,
      cancelAtPeriodEnd: !!obj.cancel_at_period_end,
    });
  }
}

export { FREE_LIFETIME_VIDEOS };
