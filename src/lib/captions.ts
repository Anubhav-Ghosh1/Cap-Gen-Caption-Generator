/**
 * Caption timing utilities, shared between the client preview and the server
 * ASS generator so what you see in the editor is what lands in the video.
 *
 * A "line" is one on-screen caption; it holds the words shown together and the
 * time span it is visible.
 */

import type { CaptionStyle } from "./styles";

export interface Word {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface Segment {
  text: string;
  start: number;
  end: number;
}

export interface CaptionLine {
  start: number;
  end: number;
  words: Word[];
  text: string;
}

const SENTENCE_END = /[.!?…]["')\]]?$/;

/** Join word tokens into natural text (no space before punctuation). */
export function joinWords(words: Word[]): string {
  return words
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+([,.!?…;:%)"'\]])/g, "$1")
    .replace(/([("'\[])\s+/g, "$1")
    .trim();
}

/**
 * Split a word list into sentence-ish groups: break after terminal
 * punctuation, on long pauses, or when a group gets too long.
 */
export function chunkWords(
  words: Word[],
  opts: { maxWords?: number; maxGap?: number } = {}
): Word[][] {
  const maxWords = opts.maxWords ?? 8;
  const maxGap = opts.maxGap ?? 1.0;
  const groups: Word[][] = [];
  let current: Word[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push(w);
    const next = words[i + 1];
    const sentenceEnd = SENTENCE_END.test(w.text);
    const pause = next ? next.start - w.end > maxGap : false;
    if (!next || sentenceEnd || pause || current.length >= maxWords) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function chunkByCount(words: Word[], size: number): Word[][] {
  const groups: Word[][] = [];
  for (let i = 0; i < words.length; i += size) {
    groups.push(words.slice(i, i + size));
  }
  return groups;
}

const PAD_S = 0.06; // keep a line on-screen briefly after its last word

/** Build the timed caption lines for a given style. */
export function buildLines(words: Word[], style: CaptionStyle): CaptionLine[] {
  if (!words.length) return [];

  let groups: Word[][];
  switch (style.mode) {
    case "word":
      groups = chunkByCount(words, 1);
      break;
    case "chunks":
      groups = chunkByCount(words, Math.max(1, style.wordsPerChunk));
      break;
    case "karaoke":
      groups = chunkWords(words, { maxWords: 5, maxGap: 1.0 });
      break;
    case "sentence":
    default:
      groups = chunkWords(words, { maxWords: 7, maxGap: 1.2 });
      break;
  }

  return groups.map((group) => {
    const start = group[0].start;
    const end = group[group.length - 1].end + PAD_S;
    let text = joinWords(group);
    if (style.uppercase) text = text.toUpperCase();
    return { start, end, words: group, text };
  });
}

/** The caption line visible at time t, plus the index of the current word. */
export function activeLineAt(
  lines: CaptionLine[],
  t: number
): { line: CaptionLine; wordIndex: number } | null {
  const line = lines.find((l) => t >= l.start && t <= l.end);
  if (!line) return null;
  let wordIndex = 0;
  for (let i = 0; i < line.words.length; i++) {
    if (line.words[i].start <= t) wordIndex = i;
  }
  return { line, wordIndex };
}
