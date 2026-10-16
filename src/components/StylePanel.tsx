"use client";

import { FONT_OPTIONS, PRESETS, type CaptionStyle } from "@/lib/styles";

function sampleCss(s: CaptionStyle): React.CSSProperties {
  return {
    color: s.textColor,
    fontWeight: s.bold ? 800 : 500,
    fontFamily: `'${s.fontFamily}', sans-serif`,
    fontStyle: s.italic ? "italic" : "normal",
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}em` : undefined,
    textTransform: s.uppercase ? "uppercase" : "none",
    WebkitTextStroke: s.outlineScale && !s.box ? "1.5px " + s.outlineColor : undefined,
    background: s.box ? s.outlineColor : undefined,
    padding: s.box ? "2px 8px" : undefined,
    borderRadius: s.box ? "4px" : undefined,
    fontSize: 13,
  };
}

function Toggle({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active ? "bg-violet-600 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

export default function StylePanel({
  style,
  onChange,
}: {
  style: CaptionStyle;
  onChange: (next: CaptionStyle) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-zinc-300 uppercase">
          Caption style
        </h3>
        <div className="grid max-h-[340px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange({ ...p })}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                p.id === style.id
                  ? "border-violet-400 bg-violet-500/15"
                  : "border-white/10 bg-white/[0.03] hover:border-white/25"
              }`}
            >
              <span className="block text-[11px] text-zinc-400">{p.name}</span>
              <span className="mt-1 block" style={sampleCss(p)}>
                {p.mode === "karaoke" ? (
                  <>
                    <span style={{ color: p.highlightColor }}>This is&nbsp;</span>
                    <span>a caption</span>
                  </>
                ) : (
                  "This is a caption"
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-zinc-300 uppercase">Text</h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="col-span-2 text-xs text-zinc-400">
            Font
            <select
              value={style.fontFamily}
              onChange={(e) => onChange({ ...style, fontFamily: e.target.value })}
              className="mt-1 w-full rounded-md border border-white/10 bg-[#12121a] px-2 py-2 text-sm text-white outline-none focus:border-violet-400"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </select>
          </label>

          <div className="col-span-2 flex gap-1.5">
            <Toggle
              title="Bold"
              active={style.bold}
              onClick={() => onChange({ ...style, bold: !style.bold })}
            >
              <span className="font-extrabold">B</span>
            </Toggle>
            <Toggle
              title="Italic"
              active={style.italic}
              onClick={() => onChange({ ...style, italic: !style.italic })}
            >
              <span className="italic">I</span>
            </Toggle>
            <Toggle
              title="ALL CAPS"
              active={style.uppercase}
              onClick={() => onChange({ ...style, uppercase: !style.uppercase })}
            >
              <span className="text-xs">AA</span>
            </Toggle>
            <Toggle
              title="Glow"
              active={!!style.glow}
              onClick={() => onChange({ ...style, glow: !style.glow })}
            >
              <span className="text-xs">Glow</span>
            </Toggle>
          </div>

          <label className="text-xs text-zinc-400">
            Size
            <input
              type="range"
              min={0.02}
              max={0.12}
              step={0.002}
              value={style.fontScale}
              onChange={(e) => onChange({ ...style, fontScale: Number(e.target.value) })}
              className="mt-1 w-full accent-violet-500"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Outline
            <input
              type="range"
              min={0}
              max={0.02}
              step={0.001}
              value={style.outlineScale}
              onChange={(e) => onChange({ ...style, outlineScale: Number(e.target.value) })}
              className="mt-1 w-full accent-violet-500"
            />
          </label>
          <label className="col-span-2 text-xs text-zinc-400">
            Letter spacing
            <input
              type="range"
              min={-0.03}
              max={0.15}
              step={0.005}
              value={style.letterSpacing}
              onChange={(e) => onChange({ ...style, letterSpacing: Number(e.target.value) })}
              className="mt-1 w-full accent-violet-500"
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-zinc-300 uppercase">Colors</h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-xs text-zinc-400">
            Text
            <input
              type="color"
              value={style.textColor}
              onChange={(e) => onChange({ ...style, textColor: e.target.value })}
              className="mt-1 h-8 w-full cursor-pointer rounded-md border border-white/10 bg-transparent"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Outline / glow
            <input
              type="color"
              value={style.outlineColor}
              onChange={(e) => onChange({ ...style, outlineColor: e.target.value })}
              className="mt-1 h-8 w-full cursor-pointer rounded-md border border-white/10 bg-transparent"
            />
          </label>
          {style.mode === "karaoke" && (
            <label className="col-span-2 text-xs text-zinc-400">
              Highlight (spoken word)
              <input
                type="color"
                value={style.highlightColor}
                onChange={(e) => onChange({ ...style, highlightColor: e.target.value })}
                className="mt-1 h-8 w-full cursor-pointer rounded-md border border-white/10 bg-transparent"
              />
            </label>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <span className="text-xs text-zinc-400">Position</span>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1">
            {(["bottom", "center", "top"] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => onChange({ ...style, position: pos })}
                className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                  style.position === pos
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {style.mode === "chunks" && (
          <label className="col-span-2 text-xs text-zinc-400">
            Words per caption: {style.wordsPerChunk}
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={style.wordsPerChunk}
              onChange={(e) => onChange({ ...style, wordsPerChunk: Number(e.target.value) })}
              className="mt-1 w-full accent-violet-500"
            />
          </label>
        )}

        <div className="col-span-2">
          <span className="text-xs text-zinc-400">Entrance animation</span>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1">
            {(["none", "pop", "fade"] as const).map((a) => (
              <button
                key={a}
                onClick={() => onChange({ ...style, animation: a })}
                className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                  (style.animation ?? "none") === a
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Tip: drag the caption on the video to move it up or down.
      </p>
    </div>
  );
}
