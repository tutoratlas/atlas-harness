# 02 — Render & Fonts: make PDF clickable

**Phase 0 — start now, runs concurrently. Completes an already-merged feature.**
**Needs nothing from the user** — the fonts are open-licensed and already installed.

## Goal

The PDF engine is already merged in `dev`: `RenderPdfButton` (web), `renderPdf`
(web orchestration), `markdownToHtml` (web), and `DesktopPdfRenderer` (Electron
`printToPDF`). But **nothing mounts the button**, and **fonts aren't embedded** so
PDFs fall back to whatever the OS has (inconsistent). Mount the render action on
markdown files, embed the fonts so output is branded and identical everywhere, and
collapse the duplicate print stylesheet.

## What the tutor sees

When previewing a `*.md` file (e.g. a generated `worksheet.md`), a **Render PDF**
button produces a branded A4 PDF in that file's `output/` folder, with an **Open
PDF** action in the success toast. Fonts look identical on every machine.

## How the pipeline already works (don't rebuild it)

`RenderPdfButton({markdown, outputPath})` → `renderPdf(markdown, outputPath)` →
`markdownToHtml(markdown)` builds a full HTML doc with inlined CSS + `@font-face`
→ `window.desktopBridge.renderMarkdownToPdf({ markdown: html, outputPath })`
(contract field is named `markdown` but carries **HTML** — keep that quirk) →
`DesktopPdfRenderer.renderToPdf` loads the HTML as a **sandboxed `data:` URI** into
a hidden `BrowserWindow` and calls `printToPDF` (A4, `preferCSSPageSize`), then
**writes to a temp file and renames** (Windows-lock already handled) →
`{ success, filePath }`. "Open" uses `localApi.materials.openPath`.

## File seam (why this is decoupled)

Input = a markdown string + an absolute `outputPath` + `print.css` + embedded
fonts. Output = `<dir>/output/<name>.pdf`. A pure function of a path/string; it
depends on nothing else and nothing depends on its internals.

## Build it

1. **Embed the fonts (the real "branded & consistent" fix).** Target families are
   already chosen in the CSS: **Source Serif 4 Variable** (body) + **DM Sans
   Variable** (headings). The woff2 files are already in the tree via
   `@fontsource-variable/source-serif-4` and `@fontsource-variable/dm-sans`. In
   `apps/web/src/pdf/markdownToHtml.ts`, replace `getFontFaces()`'s `local()`-only
   block with real `@font-face` rules whose `src` is a **base64 data URI**:
   `src: url(data:font/woff2;base64,…) format('woff2')`. Keep the family names and
   the `font-weight` ranges (`100 900` / `200 900`).
   - **Why base64 is mandatory:** the renderer loads the HTML as a sandboxed
     `data:` URI (`DesktopPdfRenderer.ts:70`), which **cannot read fonts from
     disk** — so a workspace `.atlas/fonts/` folder would *not* work for rendering.
     The fonts must travel inside the HTML. (Adjust the `.atlas/fonts/` mention in
     `00`/`03` accordingly: it's not on the render path.)
   - Simplest mechanics: import the woff2 from the fontsource package and inline as
     base64 (a tiny codegen step or a Vite `?inline`/asset import → base64). No new
     dependency, no download.

2. **De-dup `print.css`.** `markdownToHtml.ts` currently inlines a hardcoded copy of
   the stylesheet, and `apps/desktop/src/assets/print.css` is a **dead duplicate**
   (the renderer never reads it — it renders the HTML it's handed). Make one
   canonical file `apps/web/src/pdf/print.css`, import it `?raw` in
   `markdownToHtml.ts` (replacing the inline `getPrintCss()` string), and **delete**
   the desktop copy after grepping that nothing imports it.

3. **Mount Render/Open on markdown files.** In
   `apps/web/src/components/files/FilePreviewPanel.tsx`, when the previewed file is
   `*.md`, render the existing `RenderPdfButton`. Feed it `markdown = file.contents`
   (the panel already loads this) and `outputPath = <dir>/output/<basename>.pdf`
   derived from the panel's `cwd` + `relativePath`. **No new read IPC needed.**
   (Only if the panel can't surface `file.contents`: add a tiny
   `materials.readTextFile` IPC as a fallback.)

4. **(Already done — verify only.)** `DesktopPdfRenderer.ts:123-128` already
   `makeDirectory(recursive)` + temp-write + `rename`. No change; just confirm the
   output dir gets created.

5. **Smoke test.** Render a fixture markdown (headings, lists, a table, a
   blockquote, em-dashes + smart quotes) and confirm the PDF uses **embedded**
   Source Serif 4 / DM Sans — not OS fallbacks — by rendering on a box **without**
   those fonts installed and checking the output is unchanged.

## Done when

- [ ] Rendering any `*.md` in the file preview produces a branded A4 PDF in
      `<dir>/output/` and **Open PDF** opens it — no DevTools.
- [ ] The PDF uses the **embedded** fonts (verified on a machine lacking
      Source Serif 4 / DM Sans → output identical).
- [ ] One canonical `print.css`; the desktop duplicate is deleted.

## Cross-OS / risks

- **Fonts must be base64-embedded** — the sandboxed `data:` URI can't load disk
  fonts. This is the crux; don't try to point `@font-face` at workspace files.
- Preserve the variable-font weight ranges.
- The web build can't render (Electron-only); `RenderPdfButton` already shows a
  "desktop required" toast — keep it.
- Base64 fonts enlarge the HTML string (~150KB+). Fine for a `data:` URI; if
  `printToPDF` ever chokes on an oversized `data:` URI, fall back to writing the
  HTML to a temp file and `loadFile()` instead of the `data:` URI.

## Manual test (run it yourself after the agent builds this)

PDF render is **desktop-only** (Electron) — run the desktop app, not the web build.

1. **Start the desktop app** (your desktop dev command).
2. **Get a markdown file in the workspace.** Open a student → **Generate materials**
   (creates `~/tutoratlas/students/<slug>/` + a session), then create
   `students/<slug>/demo/worksheet.md` with mixed content — paste this fixture:
   ```markdown
   # Sample Worksheet
   ## Section A — short answers
   1. A question with an em-dash — like this.
   2. "Smart quotes" and a *bold* word.

   | Q | Marks |
   |---|-------|
   | 1 | 5 |

   > A blockquote to check styling.

   - bullet one
   - bullet two
   ```
3. **Open the file** in the file preview (file browser → click `worksheet.md`).
4. **Click "Render PDF".** A success toast appears → click **Open PDF** → it opens
   in your OS viewer.
5. **Output location.** `students/<slug>/demo/output/worksheet.pdf` exists.
6. **Fonts.** Body text is a serif (Source Serif 4), headings a clean sans (DM Sans)
   — *not* Times/Arial. The em-dash and smart quotes render correctly (no `□` tofu).
7. **Embedded-font proof (the important check).** Confirm the fonts are embedded,
   not pulled from the OS: run `pdffonts .../output/worksheet.pdf` (poppler-utils) and
   see embedded subsets, **or** confirm Source Serif 4 / DM Sans are *not* installed
   system-wide yet the PDF still looks right.
8. **De-dup.** `apps/desktop/src/assets/print.css` is gone and rendering still works;
   `git grep -l print.css` shows a single canonical source.
9. **Re-render safety.** With the PDF still open, click Render PDF again → it succeeds
   (temp-write + rename), no "file in use" error.

## Out of scope

Web-mode rendering; non-PDF export; the pre-render **format gate** (ships with
`06-worksheet-generator`); font subsetting.
