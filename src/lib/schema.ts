/**
 * MongoDB schema (collections + indexes) for accounts, plans and usage.
 *
 *  users          one doc per account. `_id` = lowercase username.
 *                 `emailKey` is the normalised email (lowercase, gmail dots and
 *                 +tags removed) and is UNIQUE → one free tier per real mailbox.
 *  subscriptions  one doc per user with a paid plan (`_id` = userId). The
 *                 effective plan is derived from this, never trusted from the
 *                 client. Written by the billing webhook (or mock checkout).
 *  usage          atomic counters. `_id` = `${userId}:lifetime` (free tier) or
 *                 `${userId}:YYYY-MM` (paid, resets monthly). Quota enforcement
 *                 is a single conditional $inc, so concurrent requests can't
 *                 overshoot the limit.
 *  usage_events   append-only audit log of every video processed.
 *  billing_events processed webhook event ids (idempotency).
 */

import type { Db } from "mongodb";
import type { BillingInterval, PlanId } from "./plans";

export interface UserDoc {
  _id: string; // lowercase username
  username: string;
  email?: string; // as typed (lowercased + trimmed)
  emailKey?: string; // normalised, unique
  salt: string;
  hash: string;
  createdAt: Date;
}

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export interface SubscriptionDoc {
  _id: string; // userId (lowercase username)
  plan: Exclude<PlanId, "free">;
  interval: BillingInterval;
  status: SubscriptionStatus;
  provider: "stripe" | "mock";
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageDoc {
  _id: string; // `${userId}:lifetime` | `${userId}:YYYY-MM`
  userId: string;
  period: string; // "lifetime" | "YYYY-MM"
  videos: number;
  updatedAt: Date;
}

export interface UsageEventDoc {
  userId: string;
  at: Date;
  plan: PlanId;
  period: string;
  fileName?: string;
  durationS?: number;
}

export interface BillingEventDoc {
  _id: string; // provider event id
  type: string;
  at: Date;
}

/** Create indexes once per process. */
export async function ensureIndexes(d: Db): Promise<void> {
  await Promise.all([
    d.collection("sessions").createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }),
    // unique only where an email exists, so legacy accounts without one are fine
    d
      .collection("users")
      .createIndex({ emailKey: 1 }, { unique: true, partialFilterExpression: { emailKey: { $type: "string" } } }),
    d.collection("subscriptions").createIndex({ customerId: 1 }),
    d.collection("subscriptions").createIndex({ subscriptionId: 1 }),
    d.collection("usage").createIndex({ userId: 1 }),
    d.collection("usage_events").createIndex({ userId: 1, at: -1 }),
    // billing events are only needed for a short idempotency window
    d.collection("billing_events").createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }),
  ]);
}
