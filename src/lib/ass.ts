/**
 * Generates an ASS (Advanced SubStation Alpha) subtitle file from caption
 * lines + a style preset. ASS supports outlines, boxes, karaoke word-by-word
 * highlighting, transform animations and blurred layers — all rendered by
 * ffmpeg's libass filter.
 */

import type { CaptionStyle } from "./styles";
import type { CaptionLine } from "./captions";

/** "#RRGGBB" (css) -> "&HAABBGGRR" (ass). alpha: 0 opaque .. 255 transparent. */
function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? m[1] : "ffffff";
  const r = v.slice(0, 2);
  const g = v.slice(2, 4);
  const b = v.slice(4, 6);
  const a = Math.max(0, Math.min(255, Math.round(alpha)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function fmtTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${h}:${p2(m)}:${p2(s)}.${p2(c)}`;
}

const ALIGNMENT: Record<CaptionStyle["position"], number> = {
  bottom: 2,
  center: 5,
  top: 8,
};

/** Entrance-animation override tags for a caption line. */
function animationPrefix(style: CaptionStyle): string {
  switch (style.animation) {
    case "pop":
      // scale 55% -> 106% -> 100% over the first 140ms (bouncy pop-in)
      return "{\\fscx55\\fscy55\\t(0,75,\\fscx106\\fscy106)\\t(75,140,\\fscx100\\fscy100)}";
    case "fade":
      return "{\\fad(150,120)}";
    default:
      return "";
  }
}

export function buildAss(lines: CaptionLine[], style: CaptionStyle, width: number, height: number): string {
  const fontSize = Math.max(8, Math.round(style.fontScale * height));
  const marginV = Math.round(Math.min(0.45, Math.max(0.02, style.marginV)) * height);

  // BorderStyle 3 ("opaque box") uses the *outline* color for the box fill;
  // the outline width becomes the box padding.
  const boxAlpha = 110; // semi-opaque black box
  const outline = style.box
    ? Math.round(fontSize * 0.35)
    : Math.round(style.outlineScale * height);

  // Karaoke: unfilled text shows SecondaryColour, swept to PrimaryColour.
  const primary = style.mode === "karaoke" ? style.highlightColor : style.textColor;
  const secondary = style.textColor;

  const fontName = (style.fontFamily || "Helvetica").replace(/[,;]/g, " ").trim() || "Helvetica";
  const spacing = Math.round((style.letterSpacing || 0) * fontSize);

  const header = `[Script Info]
Title: CaptionAI
ScriptType: v4.00+
PlayResX: ${Math.round(width)}
PlayResY: ${Math.round(height)}
ScaledBorderAndShadow: yes
WrapStyle: 0
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: CAP,${fontName},${fontSize},${assColor(primary)},${assColor(secondary)},${assColor(style.outlineColor)},${assColor("#000000", boxAlpha)},${style.bold ? -1 : 0},${style.italic ? -1 : 0},0,0,100,100,${spacing},0,${style.box ? 3 : 1},${outline},0,${ALIGNMENT[style.position]},${Math.round(width * 0.04)},${Math.round(width * 0.04)},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  const glow = style.glow && style.mode !== "karaoke";

  for (const line of lines) {
    const end = Math.max(line.end, line.start + 0.12);
    const start = fmtTime(line.start);
    const endT = fmtTime(end);

    let text: string;
    let prefix: string;

    if (style.mode === "karaoke") {
      prefix = "{\\fad(70,50)}";
      text = line.words
        .map((w) => {
          const cs = Math.max(1, Math.round((w.end - w.start) * 100));
          const word = style.uppercase ? w.text.toUpperCase() : w.text;
          return `{\\kf${cs}}${escapeAssText(word)}`;
        })
        .join(" ")
        .replace(/\s+([,.!?…;:%)"'\]])/g, "$1");
    } else {
      prefix = animationPrefix(style);
      text = escapeAssText(style.uppercase ? line.text.toUpperCase() : line.text);
    }

    if (glow) {
      // Blurred halo layer rendered below the text, doubling as glow + outline.
      const blur = Math.max(2, Math.round(fontSize * 0.12));
      const bord = Math.max(2, Math.round(fontSize * 0.18));
      const gc = assColor(style.outlineColor);
      events.push(
        `Dialogue: 0,${start},${endT},CAP,,0,0,0,,${prefix}{\\blur${blur}\\1c${gc}\\3c${gc}\\bord${bord}\\shad0}${text}`
      );
    }

    events.push(`Dialogue: ${glow ? 1 : 0},${start},${endT},CAP,,0,0,0,,${prefix}${text}`);
  }

  return header + events.join("\n") + "\n";
}
