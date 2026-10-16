"use client";

import { useState } from "react";
import Link from "next/link";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      window.location.href = "/studio";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            CaptionAI
          </span>
        </Link>
        <h1 className="mt-4 text-xl font-semibold">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {isLogin
            ? "Log in to open the caption studio."
            : "Free for your first 50 videos — no card needed."}
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
      >
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          {isLogin ? "Username or email" : "Username"}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
          />
        </label>
        {!isLogin && (
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={6}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-bold shadow-lg shadow-violet-600/30 transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "…" : isLogin ? "Log in" : "Sign up"}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-400">
        {isLogin ? (
          <>
            No account yet?{" "}
            <Link href="/signup" className="font-medium text-violet-300 hover:text-violet-200">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have one?{" "}
            <Link href="/login" className="font-medium text-violet-300 hover:text-violet-200">
              Log in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
