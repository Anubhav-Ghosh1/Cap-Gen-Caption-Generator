/// <reference lib="webworker" />
/**
 * Whisper in a Web Worker: the ONNX model is fetched straight from the Hugging
 * Face hub into the *user's* browser cache (Cache API), and inference runs on
 * the user's CPU via WASM. Nothing model-related touches our server.
 */

import { env, pipeline } from "@huggingface/transformers";
import { chunkWords, joinWords, type Segment, type Word } from "../lib/captions";
import { MODELS } from "../lib/whisperModels";

env.allowLocalModels = false;
env.useBrowserCache = true;
// wasm runtime: transformers' default (version-matched build from jsDelivr, then
// cached in the browser by transformers itself via env.useWasmCache).

type RawChunk = { text: string; timestamp: [number | null, number | null] };
type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<{ text: string; chunks?: RawChunk[] }>;

const SAMPLE_RATE = 16000;
const PIECE_S = 28;

const transcribers = new Map<string, Promise<Transcriber>>();

function getTranscriber(modelId: string, onPercent: (percent: number, file?: string) => void) {
  let promise = transcribers.get(modelId);
  if (!promise) {
    const files = new Map<string, { loaded: number; total: number }>();
    const approx = (MODELS.find((m) => m.id === modelId)?.approxMb ?? 80) * 1024 * 1024;
    let best = 0;
    promise = pipeline("automatic-speech-recognition", modelId, {
      dtype: "q8",
      progress_callback: (p: any) => {
        if (p?.status !== "progress" || typeof p.file !== "string") return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        // denominator never below the expected size → bar never jumps backwards
        best = Math.max(best, Math.min(99, Math.round((loaded / Math.max(total, approx * 0.9)) * 100)));
        onPercent(best, p.file);
      },
    }) as unknown as Promise<Transcriber>;
    promise.catch(() => transcribers.delete(modelId));
    transcribers.set(modelId, promise);
  }
  return promise;
}

function normalizeWords(chunks: RawChunk[], offset: number): Word[] {
  const words: Word[] = [];
  for (const c of chunks) {
    const text = c.text.trim();
    if (!text) continue;
    const [s, e] = c.timestamp;
    if (s == null) continue;
    words.push({ text, start: Math.max(0, s + offset), end: (e ?? s + 0.2) + offset });
  }
  words.sort((a, b) => a.start - b.start);
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    if (words[i].end <= words[i].start) words[i].end = next ? next.start : words[i].start + 0.2;
    if (next && words[i].end > next.start) words[i].end = next.start;
  }
  return words;
}

function buildSegments(words: Word[]): Segment[] {
  return chunkWords(words, { maxWords: 10, maxGap: 1.2 }).map((group) => ({
    start: group[0].start,
    end: group[group.length - 1].end,
    text: joinWords(group),
  }));
}

type InMsg =
  | { type: "load"; id: number; model: string }
  | { type: "transcribe"; id: number; model: string; language: string; audio: Float32Array };

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    const transcriber = await getTranscriber(msg.model, (percent, file) =>
      post({ type: "model", id: msg.id, percent, file })
    );
    if (msg.type === "load") {
      post({ type: "loaded", id: msg.id });
      return;
    }

    const { audio, language } = msg;
    const pieces = Math.max(1, Math.ceil(audio.length / SAMPLE_RATE / PIECE_S));
    const options = {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: "word",
      language,
      task: "transcribe",
    };

    const all: Word[] = [];
    for (let i = 0; i < pieces; i++) {
      const offset = i * PIECE_S;
      const piece = audio.subarray(
        offset * SAMPLE_RATE,
        Math.min(audio.length, Math.round((offset + PIECE_S) * SAMPLE_RATE))
      );
      const out = await transcriber(piece, options);
      const chunks = out.chunks ?? [{ text: out.text, timestamp: [0, piece.length / SAMPLE_RATE] as [number, number] }];
      for (const w of normalizeWords(chunks, offset)) {
        const last = all[all.length - 1];
        if (last && w.text === last.text && Math.abs(w.start - last.end) < 0.08) continue;
        all.push(w);
      }
      post({ type: "transcribing", id: msg.id, percent: Math.round(((i + 1) / pieces) * 100), chunk: i + 1, total: pieces });
    }
    post({ type: "result", id: msg.id, words: all, segments: buildSegments(all) });
  } catch (err) {
    post({ type: "error", id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
};
