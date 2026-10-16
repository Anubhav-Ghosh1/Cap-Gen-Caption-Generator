"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT; // ca-pub-xxxxxxxx
const SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

/**
 * Ad placement for free-tier users. Renders a Google AdSense unit when
 * NEXT_PUBLIC_ADSENSE_CLIENT / _SLOT are set; otherwise a house ad that
 * promotes the paid plans. Callers decide when to show it (free plan only).
 */
export default function AdSlot({ className = "" }: { className?: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || !SLOT || pushed.current) return;
    pushed.current = true;
    if (!document.querySelector("script[data-adsense]")) {
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.dataset.adsense = "1";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
      document.head.appendChild(s);
    }
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ad blocked */
    }
  }, []);

  return (
    <aside
      aria-label="Advertisement"
      className={`overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] ${className}`}
    >
      <p className="px-3 pt-2 text-[10px] tracking-widest text-zinc-500 uppercase">Advertisement</p>
      {CLIENT && SLOT ? (
        <ins
          className="adsbygoogle block"
          style={{ display: "block", minHeight: 90 }}
          data-ad-client={CLIENT}
          data-ad-slot={SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <p className="text-xs text-zinc-300">
            Remove ads, get 300 videos/month and High-quality export with Pro.
          </p>
          <Link
            href="/pricing"
            className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold hover:bg-violet-500"
          >
            See plans
          </Link>
        </div>
      )}
    </aside>
  );
}
