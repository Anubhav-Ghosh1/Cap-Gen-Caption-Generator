/** Decode any browser-playable video/audio file to mono 16 kHz PCM for Whisper. */
export async function decodeToMono16k(file: File): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf);
  } catch {
    throw new Error("Couldn't read the audio of this file in your browser. Try an mp4 (H.264/AAC) or mp3/wav.");
  } finally {
    ctx.close().catch(() => {});
  }
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice(); // own the buffer so it can be transferred
}
