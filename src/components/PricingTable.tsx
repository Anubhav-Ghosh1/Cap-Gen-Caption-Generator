"use client";

import { useState } from "react";
import Link from "next/link";
import { PLAN_ORDER, PLANS, type BillingInterval, type PlanId } from "@/lib/plans";

interface Props {
  /** null → visitor is logged out */
  currentPlan: PlanId | null;
  cancelAtPeriodEnd?: boolean;
  renewsAt?: string;
}

export default function PricingTable({ currentPlan, cancelAtPeriodEnd, renewsAt }: Props) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (path: string, body?: unknown, key = path) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mx-auto mb-8 flex w-fit rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
        {(["monthly", "yearly"] as const).map((i) => (
          <button
            key={i}
            onClick={() => setInterval(i)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              interval === i ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {i === "monthly" ? "Monthly" : "Yearly · 2 months free"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const price = interval === "monthly" ? plan.price.monthly : Math.round(plan.price.yearly / 12);
          const isCurrent = currentPlan === id;
          return (
            <div
              key={id}
              className={`flex flex-col rounded-2xl border p-6 ${
                plan.highlight
                  ? "border-violet-400/70 bg-violet-500/[0.08] shadow-lg shadow-violet-600/10"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{plan.name}</h2>
                {plan.highlight && (
                  <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                    Popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-400">{plan.tagline}</p>
              <p className="mt-5">
                <span className="text-4xl font-extrabold">${price}</span>
                <span className="text-sm text-zinc-400"> / month</span>
              </p>
              {id !== "free" && interval === "yearly" && (
                <p className="text-xs text-zinc-500">billed ${plan.price.yearly} per year</p>
              )}

              <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm text-zinc-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-emerald-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <div className="flex flex-col gap-2">
                    <span className="block rounded-xl border border-white/15 px-4 py-2.5 text-center text-sm text-zinc-300">
                      Current plan
                    </span>
                    {id !== "free" && (
                      <>
                        {renewsAt && (
                          <p className="text-center text-[11px] text-zinc-500">
                            {cancelAtPeriodEnd ? "Ends" : "Renews"} {new Date(renewsAt).toLocaleDateString()}
                          </p>
                        )}
                        <button
                          onClick={() => go("/api/billing/portal", undefined, "portal")}
                          disabled={busy !== null}
                          className="text-center text-xs text-zinc-400 underline hover:text-zinc-200 disabled:opacity-50"
                        >
                          {busy === "portal" ? "Opening…" : "Manage / cancel plan"}
                        </button>
                      </>
                    )}
                  </div>
                ) : id === "free" ? (
                  <Link
                    href={currentPlan ? "/studio" : "/signup"}
                    className="block rounded-xl border border-white/15 px-4 py-2.5 text-center text-sm font-semibold hover:border-white/40"
                  >
                    {currentPlan ? "Open the studio" : "Start free"}
                  </Link>
                ) : currentPlan ? (
                  <button
                    onClick={() => go("/api/billing/checkout", { plan: id, interval }, id)}
                    disabled={busy !== null}
                    className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-bold shadow-lg shadow-violet-600/30 disabled:opacity-50"
                  >
                    {busy === id ? "Redirecting…" : `Upgrade to ${plan.name}`}
                  </button>
                ) : (
                  <Link
                    href="/signup"
                    className="block rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-center text-sm font-bold"
                  >
                    Sign up to upgrade
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mx-auto mt-5 max-w-md rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
