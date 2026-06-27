# TutorAtlas — Build Plan (clean restart)

This folder replaces the old `.plans/22…25` tangle. The old plans cross-referenced
each other (22 → 22-1 → 23 → 23-1 …) and were hard to follow. These don't: each
numbered doc is **self-contained** and can be picked up and built on its own. The
only shared thing is this overview (the map) and the workspace structure below.

We keep what's already **merged in `dev`** as the baseline (student roster + the
PDF render engine). We ignore the unmerged branches (`auto-claude/003/004/005`) —
their good ideas are folded back into these specs, rebuilt clean.

---

## The one principle: file seams

**Every capability reads files and writes files inside one workspace. Nothing
reaches into another capability's code or memory.** The folder *is* the API
between stages. Any stage can be rebuilt, swapped, or tested alone against a
fixture file.

```
student.json → [Students] → AGENTS.md → [KB builder] → knowledge/*.md
            → [Worksheet gen] → worksheet.md → [Render] → output/*.pdf
```

Each arrow is a **file**, never a function call. That is the decoupling.

---

## The workspace (the substrate everything sits on)

One **visible, portable** folder at `~/tutoratlas` (override via setting/env).
Back it up, move machines, or sync it by copying one directory. App machinery
(provider tokens, window prefs, logs) stays in the OS app-data dir — *not* here.

```
~/tutoratlas/                          ← visible workspace = the agent's root
├── .atlas/                            ← all app internals, one place
│   └── skills/                        ← (no print.css/fonts here — rendering is self-contained
│       ├── app/                          in the app bundle; see 02-render-and-fonts)
│       │   ├── student-manager/SKILL.md
│       │   ├── knowledge-builder/SKILL.md
│       │   └── worksheet-generator/SKILL.md (+ templates/)
│       └── personal/                  ← tutor's own skills
└── students/
    └── trevor-asrjc-jc1-gp/           ← slug folder (sanitized for all 3 OSes)
        ├── student.json               ← the record (per-student = source of truth)
        ├── AGENTS.md                  ← teaching harness (the "how")
        ├── knowledge/
        │   ├── _inbox/                ← tutor drops their own materials here
        │   ├── *.md                   ← KB builder output (cited)
        │   └── sources.yaml           ← every claim → verifiable URL
        └── ai-and-society/            ← a topic
            ├── source-content.md
            ├── worksheet.md / model-answers.md
            └── output/*.pdf
```

Rules that keep it decoupled:
- The **agent never edits `student.json` directly** — only via the student MCP
  tool. The UI form goes through the same store. The file is *owned*; nobody
  reaches around it.
- Skills live at the workspace root under `.atlas/skills/` so a session rooted at
  any `students/<slug>/` discovers them by walking up the tree.
- A student's outputs nest **under that student** — never a top-level
  `materials/` — so each student folder is self-contained and portable.

---

## The demo journey (what a tutor clicks, end to end)

| # | Tutor does… | Built by |
|---|-------------|----------|
| 1 | Opens app → lands straight in their workspace, no folder picker | `03-unified-workspace` |
| 2 | Adds a student — by **form** or by **chat** ("add Mary, P5…") | merged form + `04-students-by-chat` |
| 3 | Opens student → **Generate materials** → workspace + chat session opens | merged (works today) |
| 4 | "Build the knowledge base on AI & Society" → cited `knowledge/*.md` | `05-knowledge-base-builder` |
| 5 | "/worksheet revision — AI & Society" → `worksheet.md` + `model-answers.md` | `06-worksheet-generator` |
| 6 | Clicks **Render PDF** → branded PDF → **Open** | `02-render-and-fonts` |

---

## Priority & concurrency

Built by auto-claude agents, one branch per doc. Order and what's safe to
parallelize:

| Phase | Docs | Why | Parallel? |
|-------|------|-----|-----------|
| **0 — now** | `01-branding`, `02-render-and-fonts` | Zero deps; touch disjoint files; `02` completes the already-merged PDF engine | ✅ both, alongside Phase 1 |
| **1 — foundation** | `03-unified-workspace` | The substrate 2 & 3 sit on. Riskiest → solo branch, land first | server-side toolkit of `04` can be drafted in parallel |
| **2** | `04-students-by-chat` | Establishes the agent↔files MCP+skill pattern that Phase 3 reuses | — |
| **3** | `05-knowledge-base-builder`, then `06-worksheet-generator` | Biggest + least defined; reuse Phase 2's pattern + Phase 0's render | 05 and 06 are themselves file-decoupled |

`01`, `02`, and the server-side parts of `04` touch different files than the
workspace refactor (`03`), so they're safe concurrent branches. `03` is the one
that touches routes/sidebar/store — keep it solo and merge it before the UI parts
of `04`/`06`.

---

## Cross-OS rules (we target macOS, Windows, Linux)

The structure is OS-agnostic; the risks are in the code:
1. `os.homedir()` + `path.join` everywhere. Never hardcode `/`; `~` does not
   expand in code.
2. **Sanitize slugs hard** — lowercase ASCII `[a-z0-9-]`, bounded length, avoid
   Windows-reserved names (`CON`, `PRN`, `NUL`…) and trailing dots/spaces. Forced
   lowercase prevents collisions on case-insensitive filesystems.
3. **Windows locks open files** — render to a temp file then rename, so a PDF the
   tutor has open doesn't break re-render.
4. Keep nesting shallow (Windows MAX_PATH 260).
5. The workspace root is **overridable** (for tutors whose home is on a synced
   drive).

---

## Locked decisions

| Decision | Choice |
|----------|--------|
| Baseline | Merged `dev` (roster + PDF engine). Ignore unmerged branches. |
| Decoupling | File seams: every stage reads/writes files in the workspace. |
| Workspace | One visible portable folder, `~/tutoratlas` (overridable). |
| Student record | Per-student `students/<slug>/student.json` (no central DB). |
| Record writers | UI form + student MCP tool, through one store. Agent never edits the file. |
| Project model | **Neutralize, not remove** — one hidden auto-project at the workspace; hide all pickers. |
| Students by chat | MCP toolkit (no broker — files are server-accessible) + `student-manager` skill. |
| KB source | Web-first, gravitating to tutor materials (prefer `_inbox/`, web-fill gaps). Citation gate for predictability. |
| Worksheet trigger | Skill-driven; plain chat works, optional `/worksheet` primer. |
| Onboarding | **Deferred** — assume Claude Code / Codex / Cursor already installed. |
| Builder | auto-claude agents, one branch per doc. |

---

## Index

- `01-branding.md` — T3Code → TutorAtlas (Phase 0)
- `02-render-and-fonts.md` — mount Render/Open PDF + bundle fonts (Phase 0)
- `03-unified-workspace.md` — one fixed `~/tutoratlas`, strip the folder picker (Phase 1)
- `04-students-by-chat.md` — student MCP toolkit + skill (Phase 2)
- `05-knowledge-base-builder.md` — per-student cited research (Phase 3)
- `06-worksheet-generator.md` — KB + harness → worksheet + model answers (Phase 3)
