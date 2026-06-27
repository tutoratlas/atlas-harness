# 01 — Branding: T3Code → TutorAtlas

**Phase 0 — start now, runs concurrently. Pure asset/string swap, no feature logic.**

## Goal

Replace every user-facing "T3 Code" / "t3code" brand mark with TutorAtlas — name,
window title, splash, dialogs, and app/favicon icons — across **desktop + web**.
Mobile and the marketing site are deferred (see Out of scope).

## Source art (already provided, in `assets/atlas/`)

- **`logo.svg`** — the **icon mark** (a pen-nib fused with a map-pin). `viewBox="0 0 75 105"`,
  two `<path>`s, single **black** fill, transparent background. Note: it is **not
  square** (75×105) and **pure black**, so it must be composed onto a tile (below)
  — never shipped as a bare transparent glyph (it would vanish on a dark dock).
- **`logo v1-horizontal.svg`** — wordmark lockup (glyph + "TutorAtlas"),
  `viewBox 1110×484`. **For headers/marketing only, not icons.** Caveat: "Atlas" is
  a live `<text>` element in font `IstokWeb-Bold`; if ever rasterized, install/embed
  that font or convert the text to outlines first.
- **`logo v1-vertical.svg`** — vertical lockup. Headers/marketing only.

## Decisions (locked)

- **App-icon treatment: LIGHT tile** — the black glyph centered on a **white
  rounded-square tile**.
- **One logo for all release channels** — prod / nightly / dev all get the same
  TutorAtlas light icon (no separate colorways this round).
- **Keep existing background colors** (splash/adaptive) — no brand-color change now.
- **Desktop + web only.** Mobile (Expo) + marketing assets are a later pass.

## How icons flow in this repo (place them correctly)

There are **two layers**, and both must be updated:
1. **Master tree** `assets/{prod,nightly,dev}/` with **fixed filenames** referenced
   by `scripts/lib/brand-assets.ts` and consumed by
   `scripts/build-desktop-artifact.ts` at package time. **Keep the existing
   filenames** — `brand-assets.ts` and `brand-assets.test.ts` assert them; renaming
   is extra churn, do it later if ever.
2. **Committed runtime copies** in `apps/desktop/resources/` and `apps/web/public/`
   — what dev runs use and what the web app serves directly.

---

## Part A — string swaps (no art; straight code edits)

- **Product name / identifiers**
  - `apps/desktop/package.json` → `productName`
  - `apps/desktop/src/app/DesktopEnvironment.ts` → `APP_BASE_NAME`
  - `apps/web/src/branding.ts` → default app name
  - `scripts/build-desktop-artifact.ts` → `appId` (e.g. `com.tutoratlas.app`) + product name
- **User-facing strings**
  - `apps/web/index.html` → `<title>`, splash `aria-label`, splash `alt`
  - `apps/web/src/components/SplashScreen.tsx`
  - `apps/desktop/src/app/DesktopApp.ts` (startup error), `…/window/DesktopApplicationMenu.ts`
    (update notice), `…/ssh/DesktopSshPasswordPrompts.ts`
- **Optional (back-end, low priority)** — MCP server display name `"t3-code"` →
  `"tutoratlas"`; `GIT_AUTHOR_NAME` in `apps/server/src/vcs/GitVcsDriver.ts`.
- **Leave alone** — `@t3tools/*` package scopes and `T3_*` env-var prefixes
  (internal, churny, not user-facing).

Grep `T3 Code`, `t3code`, `t3 code` across `apps/{web,desktop}` + `scripts` to catch
stragglers; skip `@t3tools/*` and env vars.

---

## Part B — icon generator (write `scripts/gen-brand-assets.mjs`)

Write a **committed, re-runnable Node ESM script** that regenerates the whole icon
set from `assets/atlas/logo.svg`, so re-running after any art change is one command.
Wire it as a `package.json` script, e.g. `"gen:brand-assets": "node scripts/gen-brand-assets.mjs"`.

**Tooling constraints (critical):**
- The dev machine has **only `rsvg-convert`** — **no** ImageMagick / `icotool` /
  `iconutil` / `sips`. The generator **must not** shell out to any of those.
- Use **`sharp`** for SVG→PNG. It is **already in the pnpm store but not hoisted**,
  so load it explicitly (don't add a dependency):
  ```js
  import { createRequire } from "node:module";
  const require = createRequire(import.meta.url);
  const sharp = require(`${repoRoot}/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp`);
  ```
  (Confirmed working: `sharp("assets/atlas/logo.svg",{density}).resize(n,n).png()`.)
- **Hand-roll the `.ico` and `.icns` containers** — both are just PNGs in a small
  binary wrapper (formats below). No extra deps.

**Icon composition** — build three wrapper SVGs around the glyph (the two `<path>`s
from `logo.svg`, native `viewBox 0 0 75 105`). Numbers below are starting points;
tune by eye:
- **App icon** (rounded, transparent corners) on a 1024 canvas: white `rect`
  `rx≈180`; glyph centered at ~**64%** canvas height (`scale≈6.24`, `translate≈(278,184)`).
- **Favicon** (tighter, so 16–48px stays legible): white `rect` `rx≈110`; glyph
  ~**80%** height (`scale≈7.8`, `translate≈(219,102)`).
- **iOS / apple-touch** (**opaque**, full-bleed, no alpha): white **full square**
  (no rounding); glyph ~64% height; `flatten` onto `#ffffff` (iOS rejects alpha and
  applies its own mask).
Render each master at high density, then downscale for crisp small sizes.

**Output matrix** (size → file; keep filenames):

| Path | File | Source |
|------|------|--------|
| `assets/prod/` | `black-macos-1024.png` | appIcon@1024 |
| | `black-universal-1024.png` | appIcon@1024 |
| | `black-ios-1024.png` | iosIcon@1024 (opaque) |
| | `t3-black-web-apple-touch-180.png` | iosIcon@180 (opaque) |
| | `t3-black-web-favicon-16x16.png` | favicon@16 |
| | `t3-black-web-favicon-32x32.png` | favicon@32 |
| | `t3-black-web-favicon.ico` | ICO{16,32,48 favicon} |
| | `t3-black-windows.ico` | ICO{16,32,48 favicon, 256 appIcon} |
| | `logo.svg` | copy of `assets/atlas/logo.svg` |
| `assets/nightly/` + `assets/dev/` | `blueprint-macos-1024.png`, `blueprint-universal-1024.png`, `blueprint-ios-1024.png`, `blueprint-web-apple-touch-180.png`, `blueprint-web-favicon-16x16.png`, `blueprint-web-favicon-32x32.png`, `blueprint-web-favicon.ico`, `blueprint-windows.ico` | **same buffers** as prod (one logo, all channels) |
| `apps/desktop/resources/` | `icon.png` | appIcon@512 |
| | `icon.ico` | ICO{16,32,48,256} |
| | `icon.icns` | ICNS (entries below) |
| `apps/web/public/` | `favicon.ico` | ICO{16,32,48} |
| | `favicon-16x16.png` | favicon@16 |
| | `favicon-32x32.png` | favicon@32 |
| | `apple-touch-icon.png` | iosIcon@180 (opaque) — **also the boot splash logo** (`index.html` boot shell points at it) |

**ICO format** (PNG-payload icons):
- 6-byte `ICONDIR`: `u16` reserved=0, `u16` type=1, `u16` count.
- `count` × 16-byte `ICONDIRENTRY`: `u8` width, `u8` height (**0 = 256**), `u8`
  colors=0, `u8` reserved=0, `u16` planes=1, `u16` bpp=32, `u32` byteSize, `u32` offset.
- Then each PNG payload at its offset.

**ICNS format:**
- 8-byte file header: `'icns'` + `u32` BE total length.
- Each entry: 4-byte OSType + `u32` BE (`8 + payloadLen`) + PNG payload.
- Entries (pixel size → type): `ic11`=32, `ic12`=64, `ic07`=128, `ic13`=256,
  `ic08`=256, `ic14`=512, `ic09`=512, `ic10`=1024 (use the appIcon renders).

## Done when

- [ ] No user-facing "T3 Code" remains (title bar, splash, about, menus, dialogs).
- [ ] `scripts/gen-brand-assets.mjs` regenerates the full set from
      `assets/atlas/logo.svg` with **no extra deps** and is deterministic on re-run.
- [ ] Desktop dock/taskbar icon + web favicon + boot splash all show the TutorAtlas
      mark on macOS, Windows, Linux.
- [ ] Favicon is legible at 16px (the tighter-padded variant).
- [ ] Build stays green: `brand-assets.ts` filenames unchanged; `brand-assets.test.ts`
      and `build-desktop-artifact.test.ts` pass.

## Notes / risks

- **Keep** the `assets/{prod,nightly,dev}` filenames — they're asserted by tests and
  read by the build.
- The lockup SVGs use live `<text>` (IstokWeb-Bold) for "Atlas" — fine for the
  in-app wordmark which is a *string*, but convert to outlines before any raster use.
- Generator must run with only `rsvg-convert` + `sharp` (pnpm store) — **no**
  ImageMagick/`sips`/`iconutil`/`icotool`.

## Manual test (run it yourself after the agent builds this)

Desktop branding can only be fully seen in the desktop app; run it on your machine.

1. **Generate the icons.** From the repo root run `node scripts/gen-brand-assets.mjs`
   (or `pnpm gen:brand-assets`). It finishes with no error. `git status` shows
   changes under `assets/{prod,nightly,dev}/`, `apps/desktop/resources/icon.*`, and
   `apps/web/public/favicon*` + `apple-touch-icon.png`.
2. **Eyeball the output.** Open `apps/web/public/apple-touch-icon.png` and
   `apps/desktop/resources/icon.png` — both show the TutorAtlas pen-pin mark, black
   on a white rounded tile, centred with padding. Open `favicon-32x32.png` — still
   legible.
3. **No user-facing "T3 Code".** Run:
   `grep -rn "T3 Code" apps/web apps/desktop scripts --include='*.ts' --include='*.tsx' --include='*.html' --include='*.json'`
   — expect no user-facing hits (internal `@t3tools/*` scopes are fine, out of scope).
4. **Run the desktop app** (your usual desktop dev command, e.g. `pnpm dev`). Check:
   window title + dock/taskbar icon = TutorAtlas; splash shows the mark + "TutorAtlas";
   app menu / About / update dialog say TutorAtlas.
5. **Web tab.** In the web build, the browser tab shows the TutorAtlas favicon and
   the title "TutorAtlas".
6. **Build stays green.** Typecheck passes and `brand-assets.test.ts` +
   `build-desktop-artifact.test.ts` pass (filenames unchanged).
7. **Reproducible.** Delete one generated file, re-run the generator → it's recreated;
   `git diff` is clean after a full regenerate.

## Out of scope

- **Mobile (Expo)**: `apps/mobile/assets/*` (icon 1024, splash 1024, favicon 180,
  android adaptive 432², iOS icon-composer) + `apps/mobile/app.config.ts` names.
- **Marketing**: `apps/marketing/public/*`.
- Renaming `@t3tools/*` package scopes or env-var prefixes.
