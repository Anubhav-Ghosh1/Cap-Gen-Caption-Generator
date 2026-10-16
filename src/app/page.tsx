import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE_NAME, getSessionUser } from "@/lib/auth";
import ModelCard from "@/components/ModelCard";

export const runtime = "nodejs";

const FEATURES = [
  {
    icon: "🎯",
    title: "Word-perfect captions",
    body: "Local Whisper AI times every single word — karaoke sweeps, word pops and punchy chunks stay perfectly in sync.",
  },
  {
    icon: "🎨",
    title: "8 animated styles",
    body: "Karaoke, Bold Pop, Word Pop, Neon Glow, Boxed, Classic, Minimal, Editorial — with pop & fade entrance animations.",
  },
  {
    icon: "✂️",
    title: "Timeline & trim",
    body: "A real timeline with a ruler, caption blocks and trim handles. Cut the video and the captions follow.",
  },
  {
    icon: "✏️",
    title: "Click-to-fix text",
    body: "Whisper misheard a word? Click the block, fix the chip. Fixes flow into preview, export and every style.",
  },
  {
    icon: "🔐",
    title: "Private & local",
    body: "The model and your videos live on this machine. No cloud, no API keys, no uploads beyond your own server.",
  },
  {
    icon: "📲",
    title: "Installable PWA",
    body: "Add to Home Screen on your phone and use it like a native app — offline shell, same network.",
  },
];

export default async function Landing() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const username = token ? await getSessionUser(token) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:py-12">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            CaptionAI
          </span>
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/pricing" className="px-3 py-1.5 text-sm text-zinc-300 hover:text-white">
            Pricing
          </Link>
        {username ? (
          <Link
            href="/studio"
            className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold hover:bg-violet-500"
          >
            Open Studio
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-300 hover:border-white/40"
          >
            Log in
          </Link>
        )}
        </nav>
      </header>

      <section className="mt-16 text-center sm:mt-24">
        <p className="text-xs font-semibold tracking-[0.3em] text-violet-300/80 uppercase">
          AI captions · 100% local
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-6xl">
          Captions that{" "}
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
            pop
          </span>
          , straight off your videos
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Upload a video, let the on-device AI transcribe it word-by-word, pick
          a style, trim the clip — export a captioned mp4 in minutes.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href={username ? "/studio" : "/signup"}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3.5 text-sm font-bold shadow-lg shadow-violet-600/30 transition-transform active:scale-[0.98]"
          >
            {username ? "Open the Studio" : "Get started — it's free"}
          </Link>
          {!username && (
            <Link
              href="/login"
              className="rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-zinc-200 hover:border-white/40"
            >
              Log in
            </Link>
          )}
        </div>

        {/* demo caption strip */}
        <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-3 opacity-90">
          <span className="rounded-md bg-black/60 px-4 py-2 text-lg font-bold text-white">
            This is <span className="text-amber-300">karaoke</span> style
          </span>
          <span
            className="text-2xl tracking-wide text-white uppercase"
            style={{ textShadow: "0 2px 0 #000, 0 0 24px rgba(124,58,237,.9)" }}
          >
            Bold Pop
          </span>
          <span
            className="text-xl font-black text-cyan-300 uppercase"
            style={{ textShadow: "0 0 10px #7c3aed, 0 0 28px #7c3aed, 0 0 46px #7c3aed" }}
          >
            Neon Glow
          </span>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:mt-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-violet-500/40"
          >
            <div className="text-2xl">{f.icon}</div>
            <h2 className="mt-3 font-semibold">{f.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
        <h2 className="text-2xl font-bold">Free for your first 50 videos</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-400">
          Every email account gets 50 videos free (ad-supported). Go Pro for 300 videos a month,
          no ads and High-quality export.
        </p>
        <Link
          href="/pricing"
          className="mt-5 inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold hover:border-white/40"
        >
          Compare plans
        </Link>
      </section>

      {username && (
        <section className="mt-12">
          <ModelCard />
        </section>
      )}

      <footer className="mt-16 border-t border-white/10 pt-6 pb-4 text-center text-xs text-zinc-500">
        CaptionAI · local Whisper transcription + ffmpeg rendering · install from
        your browser&apos;s “Add to Home Screen”
      </footer>
    </main>
  );
}
