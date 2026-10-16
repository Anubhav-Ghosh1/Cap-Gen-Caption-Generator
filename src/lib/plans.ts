/**
 * Plan catalogue. Client-safe (no server imports) so the pricing page, the
 * studio and the API routes all read the same numbers.
 * Edit prices/limits here only.
 */

import type { VideoQuality } from "./quality";

export type PlanId = "free" | "pro" | "studio";
export type BillingInterval = "monthly" | "yearly";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** USD; yearly is the total charged per year */
  price: { monthly: number; yearly: number };
  /** videos allowed per period. free = lifetime total, paid = per calendar month */
  videos: number;
  period: "lifetime" | "month";
  ads: boolean;
  /** export quality presets this plan may use */
  qualities: VideoQuality[];
  features: string[];
  highlight?: boolean;
}

export const FREE_LIFETIME_VIDEOS = 50;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try everything, supported by ads",
    price: { monthly: 0, yearly: 0 },
    videos: FREE_LIFETIME_VIDEOS,
    period: "lifetime",
    ads: true,
    qualities: ["balanced", "small"],
    features: [
      `${FREE_LIFETIME_VIDEOS} videos per email account`,
      "All caption styles & languages",
      "On-device AI transcription",
      "Balanced & Small export quality",
      "Ads shown in the studio",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For creators who post every week",
    price: { monthly: 9, yearly: 90 },
    videos: 300,
    period: "month",
    ads: false,
    qualities: ["original", "high", "balanced", "small"],
    highlight: true,
    features: [
      "300 videos every month",
      "No ads",
      "Original & High export quality",
      "All caption styles & languages",
      "Email support",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    tagline: "For teams and agencies",
    price: { monthly: 29, yearly: 290 },
    videos: 2000,
    period: "month",
    ads: false,
    qualities: ["original", "high", "balanced", "small"],
    features: [
      "2,000 videos every month",
      "No ads",
      "Original & High export quality",
      "Priority processing & support",
      "Early access to new styles",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "studio"];

export function isPlanId(v: unknown): v is PlanId {
  return v === "free" || v === "pro" || v === "studio";
}
