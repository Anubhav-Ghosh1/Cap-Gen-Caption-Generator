"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { activeLineAt, buildLines, type Word } from "@/lib/captions";
import { clampMarginV, type CaptionStyle } from "@/lib/styles";

interface DragState {
  pointerId: number;
  startClientY: number;
  startYFrac: number; // caption center as fraction of container height
}

/** Convert position + marginV to the caption's vertical center (0..1). */
function captionCenterY(style: CaptionStyle): number {
  if (style.position === "bottom") return 1 - style.marginV;
  if (style.position === "top") return style.marginV;
  return 0.5;
}

/**
 * Video player with a live caption overlay that mirrors what ffmpeg+libass
 * will burn into the exported file. Captions can be dragged vertically to
 * reposition them; playback loops inside the trimmed range.
 */
export default function VideoPreview({
  videoUrl,
  words,
  style,
  trimStart,
  trimEnd,
  videoRef,
  onLoadedMeta,
  onTime,
  onStyleChange,
}: {
  videoUrl: string;
  words: Word[];
  style: CaptionStyle;
  trimStart: number;
  trimEnd: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onLoadedMeta: (w: number, h: number, duration: number) => void;
  onTime: (t: number) => void;
  onStyleChange: (next: CaptionStyle) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [time, setTime] = useState(0);
  const [boxH, setBoxH] = useState(360);

  const lines = useMemo(() => buildLines(words, style), [words, style]);
  const inTrim = time >= trimStart - 0.02 && time <= trimEnd + 0.05;
  const active = inTrim ? activeLineAt(lines, time) : null;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight || 360));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fontSize = Math.max(10, style.fontScale * boxH);
  const strokeWidth = Math.max(0, style.outlineScale * boxH);
  const glow = style.glow && style.mode !== "karaoke";
  const glowR = Math.max(3, fontSize * 0.14);

  const textCss: React.CSSProperties = {
    fontSize,
    fontWeight: style.bold ? 800 : 500,
    color: style.textColor,
    fontFamily: `'${style.fontFamily}', system-ui, sans-serif`,
    fontStyle: style.italic ? "italic" : "normal",
    lineHeight: 1.15,
    letterSpacing: style.letterSpacing ? `${style.letterSpacing}em` : undefined,
    textAlign: "center",
    WebkitTextStroke: !glow && strokeWidth ? `${strokeWidth}px ${style.outlineColor}` : undefined,
    textShadow: glow
      ? `0 0 ${glowR}px ${style.outlineColor}, 0 0 ${glowR * 2.2}px ${style.outlineColor}, 0 0 ${glowR * 4}px ${style.outlineColor}`
      : strokeWidth
        ? undefined
        : `0 2px 10px rgba(0,0,0,.6), 0 0 2px rgba(0,0,0,.8)`,
    ...(style.box
      ? { background: style.outlineColor, padding: "0.15em 0.45em", borderRadius: "0.25em" }
      : {}),
  };

  const animClass =
    style.animation === "pop" ? "caption-pop" : style.animation === "fade" ? "caption-fade" : "";

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    let t = v.currentTime;
    // Keep playback inside the trimmed range (acts as the export preview).
    if (trimEnd > trimStart && t >= trimEnd - 0.03) {
      v.currentTime = trimStart;
      t = trimStart;
    } else if (t < trimStart - 0.05) {
      v.currentTime = trimStart;
      t = trimStart;
    }
    setTime(t);
    onTime(t);
  };

  // --- caption dragging -------------------------------------------------
  const onCaptionPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      pointerId: e.pointerId,
      startClientY: e.clientY,
      startYFrac: captionCenterY(style),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCaptionPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const box = boxRef.current;
    if (!drag || !box) return;
    const dy = (e.clientY - drag.startClientY) / box.clientHeight;
    const y = Math.min(0.96, Math.max(0.04, drag.startYFrac + dy));

    if (y >= 0.55) {
      onStyleChange({ ...style, position: "bottom", marginV: clampMarginV(1 - y) });
    } else if (y <= 0.45) {
      onStyleChange({ ...style, position: "top", marginV: clampMarginV(y) });
    } else {
      onStyleChange({ ...style, position: "center" });
    }
  };

  const onCaptionPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const pos = style.position;

  return (
    <div
      ref={boxRef}
      className="relative mx-auto flex max-h-[62vh] w-full items-center justify-center overflow-hidden rounded-2xl bg-black"
    >
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        autoPlay
        muted
        playsInline
        className="max-h-[62vh] w-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(e) =>
          onLoadedMeta(e.currentTarget.videoWidth, e.currentTarget.videoHeight, e.currentTarget.duration)
        }
      />

      {active && (
        <div
          className="absolute inset-x-0 flex cursor-grab justify-center px-4 active:cursor-grabbing"
          style={
            pos === "bottom"
              ? { bottom: `${style.marginV * 100}%` }
              : pos === "top"
                ? { top: `${style.marginV * 100}%` }
                : { top: "50%", transform: "translateY(-50%)" }
          }
          onPointerDown={onCaptionPointerDown}
          onPointerMove={onCaptionPointerMove}
          onPointerUp={onCaptionPointerUp}
          title="Drag to reposition"
        >
          <div key={active.line.start} className={`select-none touch-none ${animClass}`}>
            {style.mode === "karaoke" ? (
              <div
                style={{
                  ...textCss,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: "0 0.28em",
                  maxWidth: "92%",
                }}
              >
                {active.line.words.map((w, i) => {
                  const t = style.uppercase ? w.text.toUpperCase() : w.text;
                  return (
                    <span
                      key={i}
                      style={{ color: i <= active.wordIndex ? style.highlightColor : style.textColor }}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div style={textCss}>{active.line.text}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
