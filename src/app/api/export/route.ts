import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { burnSubtitles, ensureDirs, isSingleFrameVideo, parseQuality, EXPORTS_DIR, JOBS_DIR, probeVideo } from "@/lib/ffmpeg";
import { buildAss } from "@/lib/ass";
import { buildLines, type Word } from "@/lib/captions";
import { getRequestUser } from "@/lib/auth";
import { getUsage, userIdOf } from "@/lib/billing";
import type { CaptionStyle } from "@/lib/styles";

export const runtime = "nodejs";
export const maxDuration = 600;

interface ExportBody {
  id: string;
  width: number;
  height: number;
  style: CaptionStyle;
  /** word list as edited by the user in the timeline editor */
  words?: Word[];
  /** cut the video to [start, end] seconds; captions are shifted accordingly */
  trim?: { start?: number; end?: number };
  /** output quality preset: original | high | balanced | small */
  quality?: string;
}

/** Keep only sane word entries, drop empty texts. */
function sanitizeWords(input: unknown): Word[] | null {
  if (!Array.isArray(input)) return null;
  const out: Word[] = [];
  for (const w of input) {
    if (!w || typeof w !== "object") return null;
    const { text, start, end } = w as Word;
    if (typeof text !== "string" || !Number.isFinite(start) || !Number.isFinite(end)) return null;
    const clean = text.trim();
    if (!clean) continue;
    const s = Math.max(0, Number(start));
    out.push({ text: clean, start: s, end: Math.max(s + 0.01, Number(end)) });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    if (!(await getRequestUser(req))) {
      return NextResponse.json({ error: "Please log in first." }, { status: 401 });
    }
    const body = (await req.json()) as ExportBody;
    const { id, style } = body;

    // plan gate: free accounts can't use the high-bitrate presets
    const user = (await getRequestUser(req)) as string;
    const usage = await getUsage(userIdOf(user));
    const quality = parseQuality(body.quality);
    if (!usage.qualities.includes(quality)) {
      return NextResponse.json(
        { error: `"${quality}" export quality is available on paid plans. Pick Balanced or Small, or upgrade.` },
        { status: 403 }
      );
    }

    if (!id || !/^[a-z0-9-]+$/i.test(id)) {
      return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
    }
    if (!style || typeof style !== "object") {
      return NextResponse.json({ error: "Missing caption style." }, { status: 400 });
    }

    const jobPath = path.join(JOBS_DIR, `${id}.json`);
    let job: { videoPath: string; words: Word[] };
    try {
      job = JSON.parse(await fsp.readFile(jobPath, "utf8"));
    } catch {
      return NextResponse.json({ error: "Job not found. Please upload the video again." }, { status: 404 });
    }

    // Dimensions come from the actual file, not the client — this is what
    // keeps caption sizes correct on every resolution (incl. 4K).
    const probe = await probeVideo(job.videoPath).catch(() => ({} as Awaited<ReturnType<typeof probeVideo>>));
    const width = probe.width ?? Math.max(16, Math.round(body.width || 1280));
    const height = probe.height ?? Math.max(16, Math.round(body.height || 720));

    // Words: user-edited list from the client wins over the stored one.
    let words = sanitizeWords(body.words) ?? job.words;

    // Trimming: shift word timings so t=0 is the cut point, drop what's outside.
    const trimStart = Math.max(0, Number(body.trim?.start) || 0);
    let trimEnd = Number(body.trim?.end) || 0;
    if (probe.duration) trimEnd = Math.min(trimEnd, probe.duration); // never past EOF
    const applyTrim = trimEnd > trimStart + 0.05 || trimStart > 0.01;
    const duration = trimEnd > trimStart + 0.05 ? trimEnd - trimStart : undefined;

    if (applyTrim) {
      words = words
        .map((w) => ({
          text: w.text,
          start: w.start - trimStart,
          end: (trimEnd > trimStart ? Math.min(w.end, trimEnd) : w.end) - trimStart,
        }))
        .filter((w) => w.end > 0.04)
        .map((w) => ({ ...w, start: Math.max(0, w.start) }));
    }

    if (!words.length) {
      return NextResponse.json(
        { error: "No caption words to burn — transcribe the video first (or undo deletions)." },
        { status: 422 }
      );
    }

    const lines = buildLines(words, style);

    const assPath = path.join(JOBS_DIR, `${id}.ass`);
    await fsp.writeFile(assPath, buildAss(lines, style, width, height));

    await ensureDirs();
    const outPath = path.join(EXPORTS_DIR, `${id}-captioned.mp4`);
    await burnSubtitles(
      job.videoPath,
      assPath,
      outPath,
      applyTrim ? { start: trimStart, duration } : undefined,
      { hasVideo: probe.width != null, singleFrame: probe.width != null && (await isSingleFrameVideo(job.videoPath)), audioDuration: probe.duration, quality: parseQuality(body.quality), width, height }
    );

    const stat = await fsp.stat(outPath);
    const stream = Readable.toWeb(fs.createReadStream(outPath)) as unknown as ReadableStream;
    return new Response(stream, {
      headers: {
        "content-type": "video/mp4",
        "content-length": String(stat.size),
        "content-disposition": `attachment; filename="${id}-captioned.mp4"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed." },
      { status: 500 }
    );
  }
}
