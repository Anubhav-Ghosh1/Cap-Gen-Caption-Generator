# Cap-Gen (Caption Generator)
![Cap-Gen-Caption-Generator](https://socialify.git.ci/Anubhav-Ghosh1/Cap-Gen-Caption-Generator/image?font=Inter&language=1&name=1&owner=1&pattern=Plus&stargazers=1&theme=Dark)
Upload a video, get word-accurate captions, style them, and export the video with subtitles burned in.

Speech recognition runs **in the browser** (Whisper via `@huggingface/transformers`, Web Worker). Audio never leaves the user's device for transcription. The server only handles upload, auth, billing and the final ffmpeg render.

## Features

- In-browser transcription with selectable Whisper model (Tiny ~40 MB, Base ~80 MB default, Small ~250 MB) and language picker
- Timeline + word-chip editor to fix text and timing
- Caption styling: presets, fonts, position (top / center / bottom), modes (sentence, chunks, word, karaoke), animations (none, pop, fade)
- Live preview, trim start/end
- Server-side export with ffmpeg + libass (ASS subtitles), quality presets: original / high / balanced / small
- Email/password auth with MongoDB-backed sessions
- Plans and usage metering (Free, Pro, Studio) with Stripe billing or mock checkout
- PWA (manifest + service worker)

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript, MongoDB, bundled static ffmpeg (`bin/ffmpeg`, built with libass).

## Getting started

Requirements: Node 20+, a MongoDB instance (local or Atlas).

```bash
npm install
# create .env.local, see "Environment variables" below
npm run dev
```

Open http://localhost:3000.

`bin/ffmpeg` must be executable and compiled with libass. On Windows the app looks for `bin/ffmpeg.exe`.

### Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Run production build |

## Environment variables

Set in `.env.local`.

| Var | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | e.g. `mongodb://localhost:27017` or Atlas `mongodb+srv://...` |
| `MONGODB_DB` | no | Defaults to `captionai` |
| `BILLING_MODE` | no | `mock` forces mock checkout. Default in dev without Stripe keys |
| `STRIPE_SECRET_KEY` | for Stripe | Enables real checkout |
| `STRIPE_WEBHOOK_SECRET` | for Stripe | Verifies `/api/billing/webhook` |
| `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY` | for Stripe | Price IDs |
| `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_STUDIO_YEARLY` | for Stripe | Price IDs |
| `APP_URL` | for Stripe | Public base URL, e.g. `https://example.com` |
| `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT` | no | Ad slot shown to Free plan |

## Plans

Defined in `src/lib/plans.ts` (single source of truth for pricing page, studio and API).

| Plan | Price (mo / yr) | Videos | Ads |
|---|---|---|---|
| Free | $0 | 50 lifetime | yes |
| Pro | $9 / $90 | 300 per month | no |
| Studio | $29 / $290 | 2,000 per month | no |

Free accounts are limited to the `balanced` and `small` export presets.

## Project layout

```
src/
  app/
    api/auth/*       signup, login, logout, me
    api/upload       video upload
    api/export       ffmpeg burn-in render
    api/usage        usage read / consume
    api/billing/*    checkout, portal, webhook
    studio/          main editor page
    pricing/ login/ signup/
  components/        Studio, UploadPanel, Timeline, WordChipsEditor, StylePanel, VideoPreview, ...
  lib/
    clientWhisper.ts, decodeAudio.ts, whisperModels.ts   in-browser transcription
    captions.ts, ass.ts, styles.ts                       caption lines + ASS generation
    ffmpeg.ts, quality.ts                                server render
    auth.ts, db.ts, schema.ts, billing.ts, plans.ts      accounts, Mongo, plans
  workers/whisper.worker.ts
bin/ffmpeg           static ffmpeg with libass
data/                runtime uploads, jobs, exports (gitignored)
```

## How it works

1. Browser decodes audio and runs Whisper in a worker, producing word timestamps.
2. User edits words, timing, style and trim in the studio.
3. Browser POSTs `{ id, style, words, trim, quality }` to `/api/export`.
4. Server checks auth and plan, builds an ASS file, runs ffmpeg to burn subtitles, streams the result back.

## Notes

- `data/` holds user uploads and renders on local disk. Use persistent storage if deploying; serverless filesystems will not work for export.
- Export route `maxDuration` is 600 s.
