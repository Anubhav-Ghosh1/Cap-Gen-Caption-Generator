"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptionLine, Word } from "@/lib/captions";

/**
 * Word-level correction editor: shows the words inside the selected caption
 * line as chips. Click a word to fix its text, or the × to remove it.
 */
export default function WordChipsEditor({
  line,
  globalIndexOf,
  onChangeWord,
  onDeleteWord,
  onClose,
}: {
  line: CaptionLine;
  globalIndexOf: (word: Word) => number;
  onChangeWord: (globalIndex: number, text: string) => void;
  onDeleteWord: (globalIndex: number) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing !== null) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    setEditing(null);
  }, [line.start]);

  const commit = (i: number) => {
    const word = line.words[i];
    if (!word) return;
    const gi = globalIndexOf(word);
    const clean = draft.trim();
    if (gi >= 0 && clean && clean !== word.text) onChangeWord(gi, clean);
    setEditing(null);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
          Edit words
        </h3>
        <button
          onClick={onClose}
          className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-white/40"
        >
          Done
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {line.words.map((w, i) => (
          <span
            key={`${w.start}-${i}`}
            className="group inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
          >
            {editing === i ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit(i);
                  if (e.key === "Escape") setEditing(null);
                }}
                className="w-24 rounded border border-violet-400 bg-black/40 px-1 text-sm outline-none"
              />
            ) : (
              <button
                className="hover:text-violet-300"
                title={`${w.start.toFixed(2)}s — click to edit`}
                onClick={() => {
                  setEditing(i);
                  setDraft(w.text);
                }}
              >
                {w.text}
              </button>
            )}
            <button
              className="text-zinc-600 hover:text-red-400"
              title="Remove word"
              onClick={() => {
                const gi = globalIndexOf(w);
                if (gi >= 0) onDeleteWord(gi);
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        Fixes apply everywhere — preview, burned export, and every style.
      </p>
    </div>
  );
}
