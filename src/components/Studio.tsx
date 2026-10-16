"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import UploadPanel from "./UploadPanel";
import StylePanel from "./StylePanel";
import VideoPreview from "./VideoPreview";
import Timeline from "./Timeline";
import WordChipsEditor from "./WordChipsEditor";
import { buildLines, type Word } from "@/lib/captions";
import { getPreset, type CaptionStyle } from "@/lib/styles";
import { LANGUAGES } from "@/lib/languages";
import { transcribe } from "@/lib/clientWhisper";
import { decodeToMono16k } from "@/lib/decodeAudio";
import { DEFAULT_MODEL, MODEL_STORAGE_KEY } from "@/lib/whisperModels";
import ModelCard from "./ModelCard";
import AdSlot from "./AdSlot";
import type { UsageSummary } from "@/lib/billing";

type Stage = "upload" | "processing" | "style" | "exporting";

interface Job {
  id: string;
}

interface ProgressState {
  percent: number; // 0..100 total
  label: string;
  detail?: string;
}

/** Upload with real progress (fetch can't report upload progress). */
function uploadWithProgress(
  file: File,
  onPct: (pct: number) => void
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)."));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(data.error || "Upload failed."));
        else resolve(data);
      } catch {
        reject(new Error("Upload failed (bad server response)."));
      }
    };
    const form = new FormData();
    form.append("video", file);
    xhr.send(form);
  });
}

export default function Studio({ username }: { username: string }) {
  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const videoUrlRef = useRef<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [style, setStyle] = useState<CaptionStyle>(getPreset("karaoke"));
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [quality, setQuality] = useState<"original" | "high" | "balanced" | "small">("original");
  const [language, setLanguage] = useState<string>("english");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("captionai.language");
      if (saved) setLanguage(saved);
    } catch {
      /* storage blocked */
    }
  }, []);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      if (res.ok) setUsage(await res.json());
    } catch {
      /* offline */
    }
  }, []);
  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);
  // keep the chosen export quality inside what the plan allows
  useEffect(() => {
    if (usage && !usage.qualities.includes(quality)) {
      setQuality((usage.qualities.includes("balanced") ? "balanced" : usage.qualities[0]) as typeof quality);
    }
  }, [usage, quality]);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedLineKey, setSelectedLineKey] = useState<number | null>(null);
  const dimsRef = useRef({ w: 1280, h: 720 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<File | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [prog, setProg] = useState<ProgressState>({ percent: 0, label: "" });

  const lines = useMemo(() => buildLines(words, style), [words, style]);
  const selectedLine = useMemo(
    () => lines.find((l) => selectedLineKey !== null && Math.abs(l.start - selectedLineKey) < 0.02) ?? null,
    [lines, selectedLineKey]
  );

  const reset = useCallback(() => {
    fileRef.current = null;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    setVideoUrl(null);
    setJob(null);
    setWords([]);
    setTrim({ start: 0, end: 0 });
    setDuration(0);
    setSelectedLineKey(null);
    setDownload(null);
    setError(null);
    setStage("upload");
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }, []);

  const startTranscription = useCallback(async (file: File) => {
    let model = DEFAULT_MODEL;
    try {
      localStorage.setItem("captionai.language", language);
      model = localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL;
    } catch {
      /* storage blocked */
    }
    setError(null);
    setLimitHit(false);

    // spend one video from the quota (server-enforced) before doing any work
    try {
      const res = await fetch("/api/usage/consume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.usage) setUsage(data.usage);
      if (res.status === 402) {
        setLimitHit(true);
        setError(data.error || "You've reached your video limit.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not check your plan.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check your plan.");
      return;
    }

    setStage("processing");
    setFileName(file.name);

    try {
      // 1) decode audio on this device (0% → 10%)
      setProg({ percent: 3, label: "Reading audio on this device…" });
      const audio = await decodeToMono16k(file);

      // 2) model download (first time only, 10% → 45%) + local transcription (45% → 100%)
      setProg({ percent: 10, label: "Preparing AI model…" });
      const { words } = await transcribe(audio, { model, language }, (ev) => {
        if (ev.stage === "model") {
          setProg({
            percent: 10 + Math.round(ev.percent * 0.35),
            label: "Downloading AI model to this device (first time only)…",
            detail: `${ev.percent}%`,
          });
        } else {
          setProg({
            percent: 45 + Math.round(ev.percent * 0.55),
            label: "Transcribing on this device…",
            detail: `part ${ev.chunk}/${ev.total}`,
          });
        }
      });
      if (!words.length) throw new Error("No speech detected in this video. Is the audio audible?");

      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = URL.createObjectURL(file);
      setVideoUrl(videoUrlRef.current);
      fileRef.current = file;
      setJob(null); // uploaded lazily, only when exporting
      setWords(words);
      setStage("style");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("upload");
    }
  }, [language]);

  const handleLoadedMeta = useCallback((w: number, h: number, dur: number) => {
    dimsRef.current = { w, h };
    setDuration(dur);
    setTrim((t) => (t.end === 0 || t.end > dur ? { start: 0, end: dur } : t));
  }, []);

  const seekTo = useCallback((t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);

  const globalIndexOf = useCallback((word: Word) => words.indexOf(word), [words]);

  const changeWord = useCallback((gi: number, text: string) => {
    setWords((ws) => ws.map((w, i) => (i === gi ? { ...w, text } : w)));
  }, []);

  const deleteWord = useCallback((gi: number) => {
    setWords((ws) => ws.filter((_, i) => i !== gi));
  }, []);

  const doExport = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;
    setStage("exporting");
    setError(null);
    setProg({ percent: 0, label: "Uploading video for rendering…" });
    try {
      let id = job?.id;
      if (!id) {
        ({ id } = await uploadWithProgress(file, (pct) =>
          setProg({ percent: pct, label: "Uploading video for rendering…", detail: `${pct}%` })
        ));
        setJob({ id });
      }
      setProg({ percent: 100, label: "Burning captions into video…" });
      const trimmed = trim.start > 0.01 || (duration > 0 && trim.end < duration - 0.05);
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          width: dimsRef.current.w,
          height: dimsRef.current.h,
          style,
          words,
          trim: trimmed ? trim : undefined,
          quality,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed." }));
        throw new Error(data.error || "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setDownload({ url, name: fileName.replace(/\.[a-z0-9]+$/i, "") + "-captioned.mp4" });
      setStage("style");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
      setStage("style");
    }
  }, [job, style, words, trim, duration, fileName, quality]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header className="flex items-center justify-between gap-2">
        <Link href="/" className="text-xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            CaptionAI
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {usage && (
            <Link
              href="/pricing"
              title="Your plan & usage"
              className={`rounded-full border px-3 py-1.5 text-xs ${
                usage.remaining <= Math.max(3, usage.limit * 0.1)
                  ? "border-amber-400/50 text-amber-300"
                  : "border-white/10 text-zinc-400"
              } hover:border-white/40`}
            >
              {usage.planName} · {usage.remaining}/{usage.limit} left
              {usage.period === "month" ? " this month" : ""}
            </Link>
          )}
          <span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 sm:block">
            {username}
          </span>
          {stage !== "upload" && (
            <button
              onClick={reset}
              className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-300 transition-colors hover:border-white/40"
            >
              New video
            </button>
          )}
          <button
            onClick={logout}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-300 transition-colors hover:border-red-400/60 hover:text-red-300"
          >
            Log out
          </button>
        </div>
      </header>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          {limitHit && (
            <Link
              href="/pricing"
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
            >
              See plans
            </Link>
          )}
        </div>
      )}

      {stage === "upload" && (
        <>
          <label className="flex items-center gap-3 text-sm text-zinc-300">
            Spoken language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <UploadPanel onSelect={startTranscription} />
          <ModelCard />
          {usage?.ads && <AdSlot />}
        </>
      )}

      {(stage === "processing" || stage === "exporting") && (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-3xl border border-white/10 bg-white/[0.03] px-6 sm:min-h-[420px]">
          {stage === "exporting" && (
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          )}
          <p className="text-sm font-medium text-zinc-200">{prog.label}</p>
          {stage === "processing" && (
            <div className="w-full max-w-md">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-300"
                  style={{ width: `${prog.percent}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-zinc-500">
                <span>{prog.detail ?? ""}</span>
                <span>{prog.percent}%</span>
              </div>
            </div>
          )}
          {stage === "processing" && (
            <p className="max-w-xs text-center text-xs text-zinc-500">
              Everything runs on this machine — the first run may download the
              Whisper model before transcribing.
            </p>
          )}
          {stage === "processing" && usage?.ads && <AdSlot className="w-full max-w-md" />}
        </div>
      )}

      {stage === "style" && videoUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-4">
            <VideoPreview
              videoUrl={videoUrl}
              words={words}
              style={style}
              trimStart={trim.start}
              trimEnd={trim.end}
              videoRef={videoRef}
              onLoadedMeta={handleLoadedMeta}
              onTime={setCurrentTime}
              onStyleChange={setStyle}
            />
            <Timeline
              duration={duration}
              trimStart={trim.start}
              trimEnd={trim.end}
              onTrimChange={(start, end) => setTrim({ start, end })}
              lines={lines}
              currentTime={currentTime}
              selectedKey={selectedLineKey}
              onSelectLine={setSelectedLineKey}
              onSeek={seekTo}
            />
            {selectedLine && (
              <WordChipsEditor
                line={selectedLine}
                globalIndexOf={globalIndexOf}
                onChangeWord={changeWord}
                onDeleteWord={deleteWord}
                onClose={() => setSelectedLineKey(null)}
              />
            )}
          </div>

          <div className="flex flex-col gap-5">
            <StylePanel style={style} onChange={setStyle} />

            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Export quality
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as typeof quality)}
                className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                {(
                  [
                    ["original", "Original — best (largest file)"],
                    ["high", "High — ~12 Mbps @1080p"],
                    ["balanced", "Balanced — ~6 Mbps @1080p"],
                    ["small", "Small — ~2.5 Mbps @1080p"],
                  ] as const
                ).map(([id, label]) => {
                  const locked = !!usage && !usage.qualities.includes(id);
                  return (
                    <option key={id} value={id} disabled={locked}>
                      {locked ? `🔒 ${label} — Pro` : label}
                    </option>
                  );
                })}
              </select>
            </label>

            {download ? (
              <div className="flex flex-col gap-2">
                <a
                  href={download.url}
                  download={download.name}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-center text-sm font-bold shadow-lg shadow-violet-600/30 transition-transform active:scale-[0.98]"
                >
                  ⬇ Download captioned video
                </a>
                <button
                  onClick={doExport}
                  className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-zinc-300 hover:border-white/40"
                >
                  Re-export with current settings
                </button>
              </div>
            ) : (
              <button
                onClick={doExport}
                disabled={stage !== "style"}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-bold shadow-lg shadow-violet-600/30 transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                Export video with captions
              </button>
            )}
            {usage?.ads && <AdSlot />}
            <p className="text-center text-[11px] text-zinc-500">
              Subtitles are burned in with ffmpeg (H.264/AAC mp4
              {trim.end - trim.start > 0 && trim.end - trim.start < duration - 0.05
                ? `, trimmed to ${(trim.end - trim.start).toFixed(1)}s`
                : ", full length"}
              ).
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
