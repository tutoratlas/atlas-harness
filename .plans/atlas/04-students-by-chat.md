# 04 — Students by Chat

**Phase 2 — after the workspace lands. Establishes the agent↔files pattern Phase 3 reuses.**

## Goal

Let the tutor manage students by **talking to the agent**, as a peer to the
existing form. The agent uses a student **MCP toolkit**; a **skill** tells it when
and how. Also moves the roster to **per-student `student.json` files** in the
workspace (the decoupled source of truth).

## What the tutor sees

- "add Mary, P5, takes math and science, mum is Jenny +65 9123 4567" → a student
  appears in the roster, with her folder scaffolded.
- "who do I teach on Mondays", "update Ryan's school to RI", "drop the Tan kid" all
  work in plain chat.
- Creating is instant; **updating and deleting ask for confirmation** first.
- The form still works exactly as before.

## File seam (why this is decoupled)

Records are per-student `students/<slug>/student.json`. The MCP tool and the UI
form both go through **one student store** over those files. The **agent never
edits `student.json` directly** — only through the tools. The list is built by
scanning `students/*/student.json`; there is no central DB to corrupt.

## Build it

1. **Per-student record store** *(server/desktop)* — read = scan
   `students/*/student.json`; write = create/update/delete the folder +
   `student.json`; validate against the `Student` contract; sanitize + lowercase
   the slug; **migrate** the existing `students.json` (state dir) into per-student
   files on first run.
2. **Point the UI at the new store** *(web — `routes/students.tsx`)* — list by
   scanning; create/edit/delete via the store. Keep the form.
3. **Student MCP toolkit** *(`apps/server/src/mcp/toolkits/students/`)* — tools
   `listStudents`, `findStudents`, `getStudent`, `createStudent`, `updateStudent`,
   `deleteStudent`. The handler reads/writes the files **directly — no broker**
   (the files are server-accessible; the broker pattern from `PreviewAutomation`
   isn't needed). Validated I/O.
4. **Register the toolkit** in `McpHttpServer.ts`; expose to MCP-capable providers
   (Claude, Cursor, Grok). Note: Codex/OpenCode have no MCP today — the form covers
   them.
5. **Write-safety** *(server/contract)* — `create` auto-applies; `update`/`delete`
   pause for the agent's normal tool-approval round-trip before persisting.
6. **`student-manager/SKILL.md`** shipped into `.atlas/skills/app/` — "to add /
   list / update / remove a student, use these tools; **never edit `student.json`
   directly**." (This skill already exists in good form on the abandoned `004`
   branch — lift it as reference.)
7. **Roster live-refresh** *(web)* — re-read after an agent write (file-watch or
   refetch on focus/event) so chat-driven changes show up immediately.
8. **Tests** — toolkit CRUD against a temp workspace; invalid records rejected;
   slug collisions handled.

## Done when

- [ ] A tutor can add / find / update / delete a student purely by chat.
- [ ] The roster reflects chat-driven changes live.
- [ ] The agent never writes `student.json` directly — every change goes through a
      tool, and update/delete confirm first.
- [ ] The form still works identically; old `students.json` is migrated.

## Cross-OS / risks

Slug sanitize + collision handling (shared with `03`); serialize concurrent
UI+agent writes through the store; MCP exists only on some providers (acceptable —
the form is the fallback).

## Out of scope

Knowledge base / worksheet flows; provider onboarding.
