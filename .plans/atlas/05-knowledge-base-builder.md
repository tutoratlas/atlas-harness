# 05 — Knowledge Base Builder

**Phase 3 — the first half of the generation pipeline. File-decoupled from 06.**

## Goal

Build a per-student **knowledge base** through deep research — **web-first at the
start** (the tutor has no materials yet), gravitating to the tutor's **own
materials** as they accumulate — so worksheet content rests on grounded, **cited**
substance instead of being invented on the spot.

## What the tutor sees

"Build the knowledge base for Trevor on AI & Society" → the agent reads his
profile + teaching harness, checks his `knowledge/_inbox/` for any materials the
tutor dropped, researches the web to fill the gaps, and writes cited notes into
`knowledge/*.md` with every claim recorded in `sources.yaml`. Uncited claims are
flagged before the KB is considered done.

## The "web-first, gravitating to materials" design (no two modes)

The skill always does the same thing: **prefer whatever's in `_inbox/`, then use
web research only to fill named gaps.** Day one the inbox is empty, so it's
~all web; as the tutor drops in more materials, those lead and the web just
patches holes — **with no code change**. The balance shifts on its own.

## File seam (why this is decoupled)

Inputs = `student.json` + `AGENTS.md` + `knowledge/_inbox/*`.
Outputs = `knowledge/*.md` + `knowledge/sources.yaml`.
The worksheet generator (`06`) reads these files; nothing calls into the builder.

## Predictability gate (this is what makes web research safe)

**Every claim must land in `sources.yaml` with a verifiable URL** (lifted from the
overview's "verify every quote or convert to a hook"). A checker flags any claim
without a source before the KB passes. That's how a non-deterministic web step
produces a predictable, trustworthy artifact.

## Build it

1. **KB contract + docs** — define `knowledge/_inbox/` (tutor drop zone),
   `knowledge/*.md` (output), and the `sources.yaml` schema
   (`claim → url → quote → verified`).
2. **`knowledge-builder/SKILL.md`** in `.atlas/skills/app/` — the workflow (read
   profile/harness → prefer inbox, web-fill gaps → write cited notes → register
   every source) and the "every claim cited" rule.
3. **Web-research capability** — rely on provider-native web search/fetch
   (Claude / Cursor) or add a small web-search/fetch MCP tool if a target provider
   lacks it. Document which providers can research.
4. **Citation gate** — a checker (code or a hard skill rule) that flags uncited
   claims / unverifiable URLs before the KB is "done".
5. **KB fixture** — one student+topic (e.g. Trevor JC1 GP "AI & Society") to build
   and test against.
6. **Tests** — the gate flags an uncited claim and passes a fully-cited note.

## Done when

- [ ] Running the builder for a student+topic yields cited `knowledge/*.md` +
      `sources.yaml`.
- [ ] The citation gate passes only when every claim has a verifiable source.
- [ ] It works from an **empty** inbox (all web) and a **full** inbox
      (materials-led) with no code change.

## Cross-OS / risks

Web research is non-deterministic — the citation gate is the mitigation; provider
web availability varies; deep research has time/cost — bound it.

## Out of scope

Corpus-ingestion pipelines (KS-Bull, past-paper registries), OCR essay marking —
later phases. This builds the per-student KB seam, not a content factory.
