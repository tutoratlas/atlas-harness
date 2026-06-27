# 06 — Worksheet Generator

**Phase 3 — the second half of the generation pipeline. File-decoupled from 05.**

## Goal

Turn a student's **knowledge base + teaching harness** into a finished
**worksheet + matching model answers**, laid out to a house template and ready for
the Render button (`02`). The generator owns **presentation only** — it does not
source substance (that's the KB builder).

## What the tutor sees

"/worksheet revision — AI & Society for Trevor" (or the same request in plain
chat) → the agent fills the right template from his harness + knowledge and writes
`worksheet.md` (student-facing) and `model-answers.md` (kept separate, so answers
can be withheld). A format check warns if a name, date, or AI attribution leaked
in before rendering.

## File seam (why this is decoupled)

Inputs = `AGENTS.md` + `knowledge/*.md` (+ optional `source-content.md`).
Outputs = `worksheet.md` + `model-answers.md`.
Render (`02`) reads those files; the generator writes no PDF and calls into nothing.

## Build it

1. **Routing enums on `Student`** *(packages/contracts)* — `level`, `examPathway`,
   `subject`, all **optional/additive** (no migration; legacy records still parse).
   These are the only fields code branches on; all pedagogy stays as prose in
   `AGENTS.md`.
2. **Enriched `AGENTS.md` template** *(workspace scaffolder / desktop)* — seed from
   the enums + clearly-marked stubs (learner profile / scaffolding sequence /
   tiering rules / syllabus focus). The stub markers are what the generator warns
   on if unfilled.
3. **`worksheet-generator/SKILL.md` + templates** in `.atlas/skills/app/` — one
   markdown skeleton per artifact (worksheet / homework / revision / model-answers
   / lesson-plan / comprehension). The markdown already exists on the abandoned
   `005` branch — **lift it as reference**, rebuilt clean.
4. **Generation workflow** (in the skill) — read harness + knowledge → fill the
   chosen template → write `worksheet.md` + `model-answers.md` as **separate
   files**.
5. **Trigger** *(web)* — plain chat works via the skill; optionally add a
   `/worksheet` primer to `ChatComposer.tsx` (type + topic) for guidance. Keep it
   light — the skill is the real driver.
6. **Format gate** *(web, pure function)* — before render, flag student names
   (cross-check the roster), dates / "week N", AI attribution, and `U+FFFD`.
   Non-blocking "render anyway" warning.
7. **Fixtures** — a `source-content.md` + a filled `AGENTS.md` for one student, for
   end-to-end testing.
8. **Tests** — format-gate unit tests; `AGENTS.md` template seeds the enums and is
   idempotent (doesn't clobber a filled file).

## Done when

- [ ] For a student with a filled harness + KB, a chat request produces
      `worksheet.md` + `model-answers.md` to the right template.
- [ ] Model answers are always a separate file from the worksheet.
- [ ] The format gate flags leaked names/dates/AI attribution before render.
- [ ] Render PDF (`02`) turns them into branded PDFs.

## Cross-OS / risks

Depends on the harness being filled — warn on unfilled stubs; template drift;
always keep model answers in a separate file.

## Out of scope

Math / Science artifacts (real answer keys, LaTeX/equation rendering) and CJK
typography — later phases; the `subject` enum is the fork point. The KB/research
itself (that's `05`).
