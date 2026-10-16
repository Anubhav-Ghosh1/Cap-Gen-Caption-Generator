"use client";

import { useCallback, useRef, useState } from "react";

export default function UploadPanel({
  onSelect,
}: {
  onSelect: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
        alert("Please choose a video file (mp4, mov, webm…).");
        return;
      }
      onSelect(file);
    },
    [onSelect]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex min-h-[320px] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 text-center transition-colors sm:min-h-[420px] ${
        dragging
          ? "border-violet-400 bg-violet-500/10"
          : "border-white/15 bg-white/[0.03] hover:border-violet-400/60 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/20 text-3xl">
        🎬
      </div>
      <div>
        <p className="text-xl font-semibold">Drop your video here</p>
        <p className="mt-1 text-sm text-zinc-400">
          or tap to browse — mp4, mov, webm · up to 512 MB
        </p>
      </div>
      <span className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-violet-600/30">
        Choose video
      </span>
      <p className="max-w-xs text-xs leading-relaxed text-zinc-500">
        Transcription runs 100% on this machine with a local AI model — your
        video never leaves the device.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
