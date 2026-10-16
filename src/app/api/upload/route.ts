import { randomUUID } from "crypto";
import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { cleanupOldData, ensureDirs, JOBS_DIR, UPLOADS_DIR } from "@/lib/ffmpeg";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 512 * 1024 * 1024;

/** Step 1 of the pipeline: store the video, hand back a job id. */
export async function POST(req: Request) {
  if (!(await getRequestUser(req))) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("video");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No video file received (field: video)." }, { status: 400 });
  }

  const extGuess = (file.name.split(".").pop() || "").toLowerCase();
  const VIDEO_EXT = /^(mp4|mov|m4v|mkv|webm|avi|3gp|mp3|m4a|wav|aac|ogg|flac)$/;
  const okType =
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/") ||
    (file.type === "application/octet-stream" && VIDEO_EXT.test(extGuess));
  if (!okType) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 512 MB)." }, { status: 413 });
  }

  await ensureDirs();
  cleanupOldData().catch(() => {});

  const id = randomUUID();
  const ext = extGuess.replace(/[^a-z0-9]/g, "") || "mp4";
  const videoPath = path.join(UPLOADS_DIR, `${id}.${ext}`);
  await fsp.writeFile(videoPath, Buffer.from(await file.arrayBuffer()));

  await fsp.writeFile(
    path.join(JOBS_DIR, `${id}.json`),
    JSON.stringify({ id, videoPath, words: [], createdAt: Date.now() })
  );

  return NextResponse.json({ id });
}
