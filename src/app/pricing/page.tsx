import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE_NAME, getSessionUser } from "@/lib/auth";
import { getUsage, userIdOf } from "@/lib/billing";
import PricingTable from "@/components/PricingTable";

export const runtime = "nodejs";
export const metadata = { title: "Pricing — CaptionAI" };

const NOTES: Record<string, string> = {
  success: "You're all set — your plan is active. Enjoy!",
  cancelled: "Checkout was cancelled. No charge was made.",
  "cancelled-plan": "Your plan has been cancelled.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const username = token ? await getSessionUser(token) : null;
  const usage = username ? await getUsage(userIdOf(username)).catch(() => null) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            CaptionAI
          </span>
        </Link>
        <Link
          href={username ? "/studio" : "/login"}
          className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-300 hover:border-white/40"
        >
          {username ? "Open Studio" : "Log in"}
        </Link>
      </header>

      <section className="mt-12 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Simple, honest pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-zinc-400">
          Start free with 50 videos per email account. Upgrade when you need more videos,
          higher export quality, or an ad-free studio.
        </p>
        {checkout && NOTES[checkout] && (
          <p className="mx-auto mt-5 max-w-md rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {NOTES[checkout]}
          </p>
        )}
        {usage && (
          <p className="mt-4 text-sm text-zinc-400">
            You&apos;re on <span className="font-semibold text-zinc-200">{usage.planName}</span> ·{" "}
            {usage.used}/{usage.limit} videos used{usage.period === "month" ? " this month" : ""}
          </p>
        )}
      </section>

      <section className="mt-10">
        <PricingTable
          currentPlan={usage ? usage.plan : username ? "free" : null}
          cancelAtPeriodEnd={usage?.cancelAtPeriodEnd}
          renewsAt={usage?.renewsAt}
        />
      </section>

      <p className="mt-10 text-center text-xs text-zinc-500">
        Transcription runs on your own device. Plans cover caption rendering, export and support.
      </p>
    </main>
  );
}
