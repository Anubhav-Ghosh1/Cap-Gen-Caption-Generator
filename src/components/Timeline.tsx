"use client";

import { useRef } from "react";
import type { CaptionLine } from "@/lib/captions";

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

/**
 * Timeline strip: time ruler, caption blocks, draggable trim handles to cut
 * the video, and a playhead synced to the preview player. Click anywhere on
 * the rail to seek; click a block to edit the words in it.
 */
export default function Timeline({
  duration,
  trimStart,
  trimEnd,
  onTrimChange,
  lines,
  currentTime,
  selectedKey,
  onSelectLine,
  onSeek,
}: {
  duration: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  lines: CaptionLine[];
  currentTime: number;
  selectedKey: number | null;
  onSelectLine: (key: number) => void;
  onSeek: (t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const trimDragRef = useRef<"start" | "end" | null>(null);

  if (duration <= 0) return null;

  const pct = (v: number) => Math.min(100, Math.max(0, (v / duration) * 100));
  const timeAtX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  };

  const step = duration > 90 ? 15 : duration > 45 ? 10 : duration > 15 ? 5 : duration > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    onSeek(timeAtX(e.clientX));
  };

  const beginTrimDrag = (which: "start" | "end") => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    trimDragRef.current = which;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTrimPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const which = trimDragRef.current;
    if (!which) return;
    const t = timeAtX(e.clientX);
    if (which === "start") {
      onTrimChange(Math.min(t, trimEnd - 0.2), trimEnd);
    } else {
      onTrimChange(trimStart, Math.max(t, trimStart + 0.2));
    }
  };

  const endTrimDrag = () => {
    trimDragRef.current = null;
  };

  const trimmedLen = trimEnd - trimStart;

  return (
    <div className="flex select-none flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
          Timeline
        </h3>
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span>
            clip: {fmt(trimStart)} → {fmt(trimEnd)} ({trimmedLen.toFixed(1)}s)
          </span>
          {(trimStart > 0.01 || trimEnd < duration - 0.01) && (
            <button
              onClick={() => onTrimChange(0, duration)}
              className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] hover:border-white/40"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-[92px] w-full cursor-crosshair overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
        onPointerDown={handleTrackPointerDown}
      >
        {/* time ruler */}
        {ticks.map((t) => (
          <div key={t} className="absolute top-0 h-full" style={{ left: `${pct(t)}%` }}>
            <div className="h-2.5 w-px bg-white/25" />
            <span className="absolute top-3 left-0 -translate-x-1/2 text-[9px] text-zinc-500">
              {fmt(t)}
            </span>
          </div>
        ))}

        {/* caption blocks */}
        {lines.map((line, i) => {
          const outside = line.end < trimStart || line.start > trimEnd;
          const selected = selectedKey === line.start;
          return (
            <button
              key={`${line.start}-${i}`}
              title={line.text}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                onSelectLine(line.start);
                onSeek(line.start + 0.01);
              }}
              className={`absolute top-[38px] h-[26px] min-w-[10px] rounded-md border text-[9px] leading-none transition-colors ${
                selected
                  ? "border-fuchsia-300 bg-fuchsia-500/50"
                  : "border-violet-300/40 bg-violet-500/30 hover:bg-violet-500/50"
              } ${outside ? "opacity-25" : ""}`}
              style={{
                left: `${pct(line.start)}%`,
                width: `${Math.max(1, pct(line.end) - pct(line.start))}%`,
              }}
            />
          );
        })}

        {/* dimmed trimmed-away regions */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-0 bg-black/70"
          style={{ width: `${pct(trimStart)}%` }}
        />
        <div
          className="pointer-events-none absolute top-0 right-0 bottom-0 bg-black/70"
          style={{ width: `${100 - pct(trimEnd)}%` }}
        />

        {/* trim handles */}
        <div
          className="absolute top-0 bottom-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none rounded-l-md bg-violet-400/90"
          style={{ left: `${pct(trimStart)}%` }}
          onPointerDown={beginTrimDrag("start")}
          onPointerMove={onTrimPointerMove}
          onPointerUp={endTrimDrag}
        />
        <div
          className="absolute top-0 bottom-0 z-10 w-3 translate-x-1/2 cursor-ew-resize touch-none rounded-r-md bg-violet-400/90"
          style={{ left: `${pct(trimEnd)}%` }}
          onPointerDown={beginTrimDrag("end")}
          onPointerMove={onTrimPointerMove}
          onPointerUp={endTrimDrag}
        />

        {/* playhead */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white"
          style={{ left: `${pct(currentTime)}%` }}
        />
      </div>
      <p className="text-[10px] text-zinc-500">
        Drag the violet handles to trim the video · click the rail to seek · click a
        caption block to edit its words
      </p>
    </div>
  );
}
