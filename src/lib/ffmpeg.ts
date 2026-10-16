/**
 * ffmpeg helpers. Uses the bundled static ffmpeg (./bin/ffmpeg) which is
 * compiled with libass so caption styles render correctly.
 */

import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { spawn } from "child_process";

export const ROOT = process.cwd();
export const FFMPEG_BIN = path.join(/* turbopackIgnore: true */ ROOT, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

export const DATA_DIR = path.join(/* turbopackIgnore: true */ ROOT, "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const JOBS_DIR = path.join(DATA_DIR, "jobs");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");

export async function ensureDirs() {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  await fsp.mkdir(JOBS_DIR, { recursive: true });
  await fsp.mkdir(EXPORTS_DIR, { recursive: true });
}

export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const cap = (s: string) => (s.length > 12000 ? s.slice(s.length - 12000) : s);
    child.stderr.on("data", (d) => (stderr = cap(stderr + d.toString())));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve(stderr);
      else {
        const how = signal ? `was killed by ${signal}` : `exited with code ${code}`;
        reject(new Error(`ffmpeg ${how}:\n${stderr.split("\n").slice(-25).join("\n")}`));
      }
    });
  });
}

/** Run ffmpeg in "info" mode (-i only) and capture stderr (it exits 1). */
function ffmpegInfo(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, ["-hide_banner", "-i", path], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", () => resolve(stderr));
  });
}

export interface VideoProbe {
  width?: number;
  height?: number;
  duration?: number; // seconds
  fps?: number;
}

/** Probe a video's dimensions/duration/fps by parsing ffmpeg's own output. */
export async function probeVideo(path: string): Promise<VideoProbe> {
  const out = await ffmpegInfo(path);
  const result: VideoProbe = {};

  const dims = /Video:[^\n]*?,\s*(\d{2,6})x(\d{2,6})/.exec(out);
  if (dims) {
    result.width = parseInt(dims[1], 10);
    result.height = parseInt(dims[2], 10);
  }
  const dur = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(out);
  if (dur) {
    result.duration = parseInt(dur[1], 10) * 3600 + parseInt(dur[2], 10) * 60 + parseFloat(dur[3]);
  }
  const fps = /(\d+(?:\.\d+)?)\s*fps/.exec(out);
  if (fps) result.fps = parseFloat(fps[1]);

  // Phone clips store landscape pixels + a rotation flag. ffmpeg auto-rotates
  // on output, so the real frame is the swapped size — captions must be laid
  // out against that, not the stored size.
  const rot = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(out) ?? /\brotate\s*:\s*(-?\d+)/.exec(out);
  if (rot && result.width && result.height) {
    const deg = Math.abs(Math.round(parseFloat(rot[1]))) % 180;
    if (deg === 90) [result.width, result.height] = [result.height, result.width];
  }
  return result;
}

/** Extract mono 16 kHz PCM (s16le) audio, what Whisper expects. */
export async function extractAudioPcm(videoPath: string, pcmPath: string) {
  await runFfmpeg([
    "-v", "error",
    "-y",
    "-i", videoPath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    pcmPath,
  ]);
}

/**
 * Fonts libass may use. Pointing libass at all of /System/Library/Fonts makes
 * it parse every file there (incl. Apple Color Emoji.ttc), which spams errors
 * and can crash ffmpeg — so we expose only a curated set via symlinks.
 */
const FONT_FILES = [
  // latin / display
  "Helvetica.ttc", "HelveticaNeue.ttc", "Supplemental/Arial.ttf", "Supplemental/Arial Bold.ttf",
  "Supplemental/Arial Italic.ttf", "Supplemental/Arial Bold Italic.ttf", "Supplemental/Arial Black.ttf",
  "Supplemental/Arial Rounded Bold.ttf", "Supplemental/Impact.ttf", "Supplemental/Verdana.ttf",
  "Supplemental/Verdana Bold.ttf", "Supplemental/Verdana Italic.ttf", "Supplemental/Verdana Bold Italic.ttf",
  "Supplemental/Tahoma.ttf", "Supplemental/Tahoma Bold.ttf", "Supplemental/Trebuchet MS.ttf",
  "Supplemental/Trebuchet MS Bold.ttf", "Supplemental/Trebuchet MS Italic.ttf",
  "Supplemental/Trebuchet MS Bold Italic.ttf", "Supplemental/Georgia.ttf", "Supplemental/Georgia Bold.ttf",
  "Supplemental/Georgia Italic.ttf", "Supplemental/Georgia Bold Italic.ttf",
  "Supplemental/Times New Roman.ttf", "Supplemental/Times New Roman Bold.ttf",
  "Supplemental/Times New Roman Italic.ttf", "Supplemental/Times New Roman Bold Italic.ttf",
  "Supplemental/Courier New.ttf", "Supplemental/Courier New Bold.ttf", "Supplemental/Courier New Italic.ttf",
  "Supplemental/Courier New Bold Italic.ttf", "Supplemental/Comic Sans MS.ttf",
  "Supplemental/Comic Sans MS Bold.ttf", "Supplemental/AmericanTypewriter.ttc", "Supplemental/Futura.ttc",
  "Supplemental/Chalkduster.ttf", "Supplemental/Didot.ttc", "Supplemental/Rockwell.ttc",
  "Supplemental/Copperplate.ttc", "Supplemental/Baskerville.ttc", "Supplemental/Brush Script.ttf",
  "MarkerFelt.ttc", "Avenir Next.ttc", "Avenir Next Condensed.ttc",
  // non-latin fallbacks (Hindi & other scripts, CJK, Arabic, Thai)
  "Supplemental/Arial Unicode.ttf", "Supplemental/DevanagariMT.ttc", "Supplemental/Devanagari Sangam MN.ttc",
  "Kohinoor.ttc", "KohinoorBangla.ttc", "KohinoorGujarati.ttc", "KohinoorTelugu.ttc",
  "NotoSansKannada.ttc", "AppleSDGothicNeo.ttc", "Hiragino Sans GB.ttc", "GeezaPro.ttc", "ThonburiUI.ttc",
  "NotoNastaliq.ttc",
];

let fontsDirPromise: Promise<string> | null = null;

/** Build (once) a directory of symlinks to the curated system fonts. */
export function ensureFontsDir(): Promise<string> {
  if (!fontsDirPromise) {
    fontsDirPromise = (async () => {
      const dir = path.join(DATA_DIR, "fonts");
      await fsp.mkdir(dir, { recursive: true });
      for (const rel of FONT_FILES) {
        const src = path.join("/System/Library/Fonts", rel);
        if (!fileExists(src)) continue;
        const link = path.join(dir, path.basename(rel));
        try {
          await fsp.symlink(src, link);
        } catch {
          /* already linked */
        }
      }
      return dir;
    })().catch((err) => {
      fontsDirPromise = null;
      throw err;
    });
  }
  return fontsDirPromise;
}

/** Escape a value for use inside an ffmpeg filter expression. */
function filterEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

import type { VideoQuality } from "./quality";
export type { VideoQuality };

/** CRF + optional bitrate ceiling (kbps per 1080p-equivalent pixel count is scaled in burnSubtitles). */
const QUALITY: Record<VideoQuality, { crf: number; maxMbps1080?: number; preset: string }> = {
  original: { crf: 16, preset: "medium" },
  high: { crf: 20, maxMbps1080: 12, preset: "medium" },
  balanced: { crf: 23, maxMbps1080: 6, preset: "medium" },
  small: { crf: 28, maxMbps1080: 2.5, preset: "medium" },
};

export function parseQuality(v: unknown): VideoQuality {
  return v === "high" || v === "balanced" || v === "small" ? v : "original";
}

/**
 * True when the file's video stream has at most one frame (voice-note .mov,
 * cover-art audio…). Only those need the loop filter; applying it to normal
 * videos made ffmpeg replay frame 0 endlessly at EOF.
 */
export async function isSingleFrameVideo(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      FFMPEG_BIN,
      ["-hide_banner", "-v", "info", "-i", path, "-map", "0:v:0", "-c", "copy", "-frames:v", "3", "-f", "null", "-"],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let err = "";
    child.stderr.on("data", (d) => (err = (err + d.toString()).slice(-4000)));
    child.on("error", () => resolve(false));
    child.on("close", () => {
      const m = [...err.matchAll(/frame=\s*(\d+)/g)].pop();
      resolve(m ? parseInt(m[1], 10) <= 1 : false);
    });
  });
}

export interface BurnOptions {
  /** video stream has a single frame → loop it to cover the audio */
  singleFrame?: boolean;
  /** output quality preset (CRF + bitrate cap); default "original" */
  quality?: VideoQuality;
  /** displayed frame size, used to scale the bitrate cap with resolution */
  width?: number;
  height?: number;
  /** false for audio-only uploads (mp3/wav/1-frame .mov voice notes…) */
  hasVideo?: boolean;
  /** container duration in seconds, used to size the background for audio-only files */
  audioDuration?: number;
}

/**
 * Burn a subtitle file (libass) into the video, H.264 + AAC mp4 output.
 * Handles quirky inputs: single-frame videos are extended to cover the audio
 * (loop + -shortest), and audio-only files get a neutral background.
 * Optionally cut the video: `trim.start` seek + `trim.duration` output length.
 */
export async function burnSubtitles(
  videoPath: string,
  assPath: string,
  outPath: string,
  trim?: { start: number; duration?: number },
  opts?: BurnOptions
) {
  const fontsDir = await ensureFontsDir();
  const ass = `ass=filename='${filterEscape(assPath)}':fontsdir='${filterEscape(fontsDir)}'`;
  const hasVideo = opts?.hasVideo ?? true;

  const q = QUALITY[opts?.quality ?? "original"];
  // cap scales with pixel count so 4K isn't starved and 480p isn't inflated
  const px = (opts?.width ?? 1920) * (opts?.height ?? 1080);
  const maxrate = q.maxMbps1080
    ? Math.round(q.maxMbps1080 * 1000 * Math.min(4, Math.max(0.25, px / (1920 * 1080))))
    : undefined;

  const args = ["-v", "warning", "-y"];

  if (hasVideo) {
    if (trim && trim.start > 0.01) args.push("-ss", trim.start.toFixed(3));
    args.push("-i", videoPath);
  } else {
    // audio-only: dark background sized to the audio duration
    const bgDur = (trim?.duration ?? opts?.audioDuration ?? 30).toFixed(3);
    args.push("-f", "lavfi", "-t", bgDur, "-i", "color=c=0x0f0f16:s=1280x720:r=30");
    if (trim && trim.start > 0.01) args.push("-ss", trim.start.toFixed(3));
    args.push("-i", videoPath);
  }
  // hard output bound so a looping/odd input can never run away
  const outLimit = trim?.duration && trim.duration > 0 ? trim.duration : opts?.audioDuration;
  if (outLimit && outLimit > 0) args.push("-t", (outLimit + 0.25).toFixed(3));

  if (hasVideo) {
    args.push(
      // loop=…:1 extends a 1-frame video stream so captions survive into audio length
      "-vf", `${opts?.singleFrame ? "loop=loop=-1:size=1," : ""}${ass},format=yuv420p`,
      "-map", "0:v:0",
      "-map", "0:a?"
    );
  } else {
    args.push("-vf", `${ass},format=yuv420p`, "-map", "0:v", "-map", "1:a?");
  }

  args.push(
    "-shortest",
    "-map_metadata", "0",
    "-c:v", "libx264",
    // high-quality encode: captions exports should be visually lossless
    "-preset", q.preset,
    "-crf", String(q.crf),
    ...(maxrate
      ? ["-maxrate", `${maxrate}k`, "-bufsize", `${maxrate * 2}k`]
      : []),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outPath
  );
  await runFfmpeg(args);
}

/** Delete uploads/jobs/exports older than maxAge (fire-and-forget safe). */
export async function cleanupOldData(maxAgeMs = 6 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const dir of [UPLOADS_DIR, JOBS_DIR, EXPORTS_DIR]) {
    let names: string[] = [];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const p = path.join(dir, name);
      try {
        const st = await fsp.stat(p);
        if (now - st.mtimeMs > maxAgeMs) await fsp.rm(p, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

export function fileExists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
