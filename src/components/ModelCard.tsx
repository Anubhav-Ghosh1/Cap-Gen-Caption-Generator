"use client";

import { useCallback, useEffect, useState } from "react";

import {
  cacheSupported,
  deleteModel,
  getModelStatuses,
  loadModel,
  type LocalModelInfo as ModelInfo,
} from "@/lib/clientWhisper";
import { DEFAULT_MODEL, MODEL_STORAGE_KEY as STORAGE_KEY } from "@/lib/whisperModels";

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

/**
 * Local AI model manager: pick a Whisper size, download it to this machine
 * (real progress bar), delete it, and choose which one transcription uses.
 * Once downloaded, transcription runs fully offline.
 */
export default function ModelCard() {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [downloading, setDownloading] = useState<{ model: string; percent: number; file?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // evaluated after mount: `caches` differs between server render and browser
  const [noCache, setNoCache] = useState(false);

  const refresh = useCallback(async () => {
    const list = await getModelStatuses();
    setModels(list);
    let saved = "";
    try {
      saved = localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      /* storage blocked */
    }
    setSelected(list.some((m) => m.model === saved) ? saved : DEFAULT_MODEL);
  }, []);

  useEffect(() => {
    setNoCache(!cacheSupported());
    refresh();
  }, [refresh]);

  const choose = (id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage blocked */
    }
  };

  const download = async (id: string) => {
    if (downloading) return;
    setError(null);
    setDownloading({ model: id, percent: 0 });
    try {
      await loadModel(id, (ev) => {
        if (ev.stage === "model") setDownloading({ model: id, percent: ev.percent, file: ev.file });
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Model download failed.");
    } finally {
      setDownloading(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this model from this device? You can re-download it anytime.")) return;
    setError(null);
    try {
      await deleteModel(id);
      await refresh();
    } catch {
      setError("Could not delete the model.");
    }
  };

  const active = models?.find((m) => m.model === selected);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">Local AI model</h2>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        The model downloads straight to this device and transcription runs here — nothing is
        stored on or sent to a server. Download once and it works offline. Bigger models are more accurate (use Small
        for Hindi and other non-English languages).
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {models ? (
          models.map((m) => {
            const isSel = m.model === selected;
            const busy = downloading?.model === m.model;
            return (
              <div
                key={m.model}
                className={`rounded-xl border px-3 py-2.5 ${
                  isSel ? "border-violet-400 bg-violet-500/10" : "border-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="radio"
                      name="model"
                      checked={isSel}
                      onChange={() => choose(m.model)}
                      className="accent-violet-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-zinc-100">
                        {m.label ?? m.model}{" "}
                        <span className="text-xs text-zinc-500">· ~{m.approxMb} MB</span>
                      </span>
                      <span className="block truncate text-[11px] text-zinc-500">
                        {m.downloaded ? (
                          <span className="text-emerald-400">Downloaded ✓ ({mb(m.bytes)})</span>
                        ) : (
                          <span className="text-amber-400">Not downloaded</span>
                        )}
                      </span>
                    </span>
                  </label>
                  {m.downloaded ? (
                    <button
                      onClick={() => remove(m.model)}
                      disabled={!!downloading}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:border-red-400/60 hover:text-red-300 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => download(m.model)}
                      disabled={!!downloading}
                      className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                    >
                      ⬇ Download
                    </button>
                  )}
                </div>
                {busy && downloading && (
                  <div className="mt-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-150"
                        style={{ width: `${downloading.percent}%` }}
                      />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-zinc-500">
                      Downloading… {downloading.percent}%{downloading.file ? ` · ${downloading.file}` : ""}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-xs text-zinc-400">Checking…</p>
        )}
      </div>

      {active && !active.downloaded && (
        <p className="mt-3 text-[11px] text-zinc-500">
          The selected model isn&apos;t downloaded yet — it will download automatically the first
          time you transcribe.
        </p>
      )}

      {noCache && (
        <p className="mt-2 text-[11px] text-amber-400">
          This page isn&apos;t on https/localhost, so the browser can&apos;t keep the model — it will
          re-download every time.
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
