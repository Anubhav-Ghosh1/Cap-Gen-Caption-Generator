/**
 * Browser-side Whisper client. The model is downloaded from the Hugging Face
 * hub to this device (browser Cache API) and inference runs locally in a Web
 * Worker — nothing is stored on, or sent to, our server.
 */

import type { Segment, Word } from "./captions";
import { MODELS } from "./whisperModels";

const CACHE_NAME = "transformers-cache";

let worker: Worker | null = null;
let nextId = 1;

type Pending = { reject: (e: Error) => void };
const pending = new Set<Pending>();

function failAll(message: string) {
  for (const p of [...pending]) p.reject(new Error(message));
  pending.clear();
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL("../workers/whisper.worker.ts", import.meta.url), { type: "module" });
    w.addEventListener("error", (e) => {
      console.error("[whisper worker]", e);
      failAll(`AI worker failed to start${e.message ? `: ${e.message}` : ""}. Check your connection and reload.`);
    });
    w.addEventListener("messageerror", () => failAll("AI worker sent unreadable data."));
    worker = w;
  }
  return worker;
}

export type ModelEvent = { stage: "model"; percent: number; file?: string };
export type TranscribeEvent =
  | ModelEvent
  | { stage: "transcribing"; percent: number; chunk: number; total: number };

/** If the worker sends nothing for this long, assume it is stuck. */
const STALL_MS = 180_000;

function request<T>(msg: Record<string, unknown>, onEvent?: (e: TranscribeEvent) => void, transfer: Transferable[] = []) {
  return new Promise<T>((resolve, reject) => {
    const w = getWorker();
    const id = nextId++;
    let timer: ReturnType<typeof setTimeout>;
    const entry: Pending = { reject: (e) => done(() => reject(e)) };

    const done = (fn: () => void) => {
      clearTimeout(timer);
      w.removeEventListener("message", handler);
      pending.delete(entry);
      fn();
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          failAll(
            "The AI model is taking too long to load. Make sure you can reach huggingface.co, then try again."
          ),
        STALL_MS
      );
    };
    const handler = (e: MessageEvent) => {
      const m = e.data;
      if (m.id !== id) return;
      arm();
      if (m.type === "model") onEvent?.({ stage: "model", percent: m.percent, file: m.file });
      else if (m.type === "transcribing")
        onEvent?.({ stage: "transcribing", percent: m.percent, chunk: m.chunk, total: m.total });
      else if (m.type === "loaded" || m.type === "result") done(() => resolve(m as T));
      else if (m.type === "error") done(() => reject(new Error(m.error)));
    };

    pending.add(entry);
    w.addEventListener("message", handler);
    arm();
    w.postMessage({ ...msg, id }, transfer);
  });
}

/** Download (if needed) and load a model on this device. */
export async function loadModel(model: string, onEvent?: (e: TranscribeEvent) => void) {
  await request({ type: "load", model }, onEvent);
  // ask the browser not to evict the model under storage pressure
  navigator.storage?.persist?.().catch(() => {});
}

export async function transcribe(
  audio: Float32Array,
  opts: { model: string; language: string },
  onEvent?: (e: TranscribeEvent) => void
): Promise<{ words: Word[]; segments: Segment[] }> {
  const r = await request<{ words: Word[]; segments: Segment[] }>(
    { type: "transcribe", model: opts.model, language: opts.language, audio },
    onEvent,
    [audio.buffer]
  );
  return { words: r.words, segments: r.segments };
}

export interface LocalModelInfo {
  model: string;
  label: string;
  approxMb: number;
  downloaded: boolean;
  bytes: number;
}

/** True when the browser can persist models (needs https or localhost). */
export function cacheSupported(): boolean {
  return typeof caches !== "undefined";
}

export async function getModelStatuses(): Promise<LocalModelInfo[]> {
  const out: LocalModelInfo[] = [];
  let keys: Request[] = [];
  let cache: Cache | null = null;
  if (cacheSupported()) {
    try {
      cache = await caches.open(CACHE_NAME);
      keys = [...(await cache.keys())];
    } catch {
      /* blocked */
    }
  }
  for (const m of MODELS) {
    const mine = keys.filter((k) => k.url.includes(`/${m.id}/`));
    let bytes = 0;
    for (const k of mine) {
      const res = await cache?.match(k);
      bytes += Number(res?.headers.get("content-length") || 0);
    }
    out.push({
      model: m.id,
      label: m.label,
      approxMb: m.approxMb,
      downloaded: mine.filter((k) => k.url.includes(".onnx")).length >= 2,
      bytes,
    });
  }
  return out;
}

export async function deleteModel(model: string) {
  if (!cacheSupported()) return;
  const cache = await caches.open(CACHE_NAME);
  for (const k of await cache.keys()) {
    if (k.url.includes(`/${model}/`)) await cache.delete(k);
  }
  // drop the in-memory session too so a re-download really re-fetches
  worker?.terminate();
  worker = null;
}
