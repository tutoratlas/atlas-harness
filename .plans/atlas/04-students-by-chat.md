# 04 — Students by Chat

**Phase 2 — after the workspace (`03`) lands. Establishes the agent↔files MCP+skill pattern Phase 3 reuses.**

## Goal

Let the tutor manage students by **talking to the agent**, as a peer to the
existing form. The agent uses a student **MCP toolkit**; a **skill** tells it when
and how. Records move to **per-student `student.json` files** in the workspace (the
decoupled source of truth).

## What the tutor sees

- "add Mary, P5, takes math and science, mum is Jenny +65 9123 4567" → a student
  appears in the roster (live), with her folder scaffolded.
- "who do I teach on Mondays", "find students taking GP", "update Ryan's school to
  RI", "drop the Tan kid" all work in plain chat.
- Creating is instant; **updating and deleting ask for confirmation** first, and a
  delete is **recoverable** (soft-deleted, not destroyed).
- The form still works exactly as before.

## Decisions (resolved in design Q&A)

| # | Question | Choice |
|---|----------|--------|
| 1 | Skill delivery | **File-based.** `.atlas/skills/student-manager/SKILL.md`, discovered **natively** from cwd. A one-line pointer in the seeded `AGENTS.md`/`CLAUDE.md` ("skills live in `.atlas/skills/`; read the matching `SKILL.md`") reaches all three. No prompt injection, no per-provider materialization. |
| 2 | Providers | **Claude + Cursor + Codex.** All three already receive our HTTP MCP (`t3-code`) — **Codex included** (`CodexAdapter.ts:1405-1418`). So a new toolkit is reachable by all three once registered. **MCP-only; the agent never edits `student.json` directly.** |
| 3 | Record store | **Per-student `students/<slug>/student.json`** under the `03` workspace (`~/tutoratlas`). No central DB. Slug via the contract's `deriveStudentSlug` (`students.ts:70-78`). |
| 4 | Data writes | MCP handler reads/writes the files **directly server-side** (Effect `FileSystem`/`Path` are in the server runtime) — **no broker** for data. |
| 5 | Destructive safety | **Soft-delete** the folder to `.trash/` (recoverable) **+ an always-on confirm** (a *scoped* `StudentsConfirmBroker` → native modal, shown regardless of permission mode). *Not* the provider's `Tool.Destructive` gate alone — it's auto-approved in full-access mode (the bug that bit `004`). |
| 6 | Live refresh | **Server file-watch** on `students/**/student.json` → a `subscribeStudents` WS push → the roster refetches. Catches every writer (form, MCP, manual edit). |
| 7 | Migration | **One-time, idempotent.** Convert the old single `students.json` into per-student files; keep the old file as `.bak`. |

## How it plugs in (audited wiring — reuse these)

- **Toolkit registration** — `McpServer.toolkit(...).pipe(Layer.provide(handlersLive))`,
  merged in `apps/server/src/mcp/McpHttpServer.ts:177` and `layer` at `188-191`.
  Example tool def `toolkits/preview/tools.ts:36-46`; handler+layer `handlers.ts:33-57`.
- **Direct-FS handler** — the server boots on `NodeServices.layer` (`bin.ts:17`,
  `server.ts:152`) so a handler can `const fs = yield* FileSystem.FileSystem` +
  `Path.Path` and read/write any path with **no client round-trip**.
- **Capability scope** — `McpInvocationContext.ts:6` (`McpCapability = "preview"`),
  granted set at `McpSessionRegistry.ts:106` (`new Set(["preview"])`). **Extend both
  to include `"students"`.**
- **Per-provider MCP config (no changes needed)** — Claude `ClaudeAdapter.ts:3475-3487`,
  Cursor `CursorAdapter.ts:542-558`, **Codex `CodexAdapter.ts:1405-1418`** (HTTP via
  `mcp_servers.t3-code.url`).
- **Skill seeding + native discovery** — `DesktopWorkspace.ts:41,46-53` already seeds
  `AGENTS.md`; Claude reads `CLAUDE.md`/`.claude/skills`, Codex has native
  `skills/list` (`CodexProvider.ts:357-371`), Cursor/Grok read `AGENTS.md`.
- **Students persistence + contract** — `Student` (+ `deriveStudentSlug`,
  `workspaceFolder = "students/<slug>"`) `packages/contracts/src/students.ts:43-78`;
  store `DesktopStudents.ts:78-166` (atomic temp+rename `110-125`); IPC
  `ipc/methods/students.ts:9-27`; localApi `localApi.ts:122-132`; web roster
  `routes/students.tsx:24-46` (**one-shot read today — no refetch**).
- **Confirm modal** — `localApi.dialogs.confirm` → `ipc/methods/window.ts:83-94`
  (client-only native modal). Server reaches it via a broker (next section).
- **File-watch pattern + WS push** — copy `serverSettings.ts:504-519`
  (`fs.watch` + debounce + emit); push via the `subscribe*` WS family
  (`ws.ts:172,204-207`) backed by a broadcaster (model: `VcsStatusBroadcaster`).

## File seam (why this is decoupled)

Records are per-student `students/<slug>/student.json`. The MCP tool and the UI
form both go through **the same per-student file layout** (shared read/write +
validation via the `Student` contract). The **agent never edits `student.json`
directly** — only through the tools. The list is built by scanning
`students/*/student.json`; there is no central DB to corrupt. The **only**
client round-trip is the destructive-op confirm (a tiny scoped broker) — data
writes stay direct-FS.

## Build it

1. **Shared per-student file store** *(shared lib both desktop + server import)* —
   read = scan `<workspaceRoot>/students/*/student.json`, validate each against the
   `Student` contract (skip/repair invalid, don't crash); write = atomic per-file
   (reuse the temp+rename of `DesktopStudents.ts:110-125`); slug via
   `deriveStudentSlug` (confirm it yields lowercase `[a-z0-9-]`, Windows-safe —
   shared with `03`). `<workspaceRoot>` is `03`'s `~/tutoratlas`.
2. **Repoint the form path** *(desktop)* — `DesktopStudents` `getRegistry` →
   directory scan, `setRegistry` → per-file writes, under the workspace. Keep the
   IPC + contract surface (`getStudents`/`setStudents`) so the form/roster barely
   change. **Migration:** on first run, if the old `~/.t3/.../students.json` exists
   and the workspace has no per-student files, write each record to
   `students/<slug>/student.json` + scaffold the folder, drop a done-marker, rename
   the old file `.bak`. Idempotent.
3. **Live-refresh the roster** *(server + web)* — add a server file-watcher (copy
   `serverSettings.ts:504`) on `students/**/student.json` → a `StudentsBroadcaster`
   PubSub → a `subscribeStudents` WS method; `routes/students.tsx` subscribes and
   refetches (today it never does).
4. **Student MCP toolkit** *(`apps/server/src/mcp/toolkits/students/`)* — tools
   `listStudents`, `findStudents`, `getStudent`, `createStudent`, `updateStudent`,
   `deleteStudent`; handlers use `FileSystem`/`Path` to read/write the per-student
   files **directly** (no broker); validate via the `Student` contract. Annotate
   `update`/`delete` with `Tool.Destructive`. Register in `McpHttpServer.ts:177,188`.
5. **Grant the capability** *(server)* — extend `McpCapability` to
   `"preview" | "students"` (`McpInvocationContext.ts:6`) and add `"students"` to the
   issued set (`McpSessionRegistry.ts:106`).
6. **Destructive confirm + soft-delete** *(server + client)* — `deleteStudent` moves
   `students/<slug>/` → `.trash/<slug>-<ts>/` (recoverable, never hard-delete).
   `update`/`delete` first ask an **always-on confirm**: a minimal
   `StudentsConfirmBroker` mirroring `PreviewAutomationBroker.ts:167-301` that
   `invoke`s a "Delete student X?" request to the focused client →
   `localApi.dialogs.confirm` → reply unblocks the handler. *Shown regardless of
   permission mode.* **Lighter fallback if deferring the broker:** annotate
   `Tool.Destructive` (provider gate) + a two-step `confirm:true` tool arg; soft-delete
   keeps it safe either way — but the gate is bypassable in full-access mode.
7. **`student-manager` skill** *(workspace asset + pointer)* — ship
   `.atlas/skills/student-manager/SKILL.md` (via `03`'s scaffolder) — "to add / list /
   update / remove a student, use the student MCP tools; **never edit `student.json`
   directly**." Add the one-line skills pointer to the seeded `AGENTS.md` (and
   `CLAUDE.md` for Claude) so all three discover it natively.
8. **Tests** — toolkit CRUD against a temp workspace; invalid records rejected; slug
   collisions handled; migration idempotent; soft-delete recoverable.

## Done when

- [ ] A tutor can add / find / update / delete a student purely by chat **on Claude,
      Cursor, and Codex**.
- [ ] The roster reflects chat-driven changes **live**.
- [ ] The agent never writes `student.json` directly — every change goes through a
      tool; `update`/`delete` confirm first and a delete is recoverable from `.trash/`.
- [ ] The form still works identically; the old `students.json` is migrated + `.bak`ed.

## Load-bearing / don't break

- The `t3-code` HTTP MCP wiring in all three adapters — **don't touch**; the toolkit
  rides it for free.
- `resolveThreadWorkspaceCwd` / `worktreePath` (from `03`) — the MCP endpoint is
  per-thread (`McpProviderSession`), so the toolkit operates against the right
  workspace; keep that intact.

## Cross-OS / risks

- Slug sanitization shared with `03` — lowercase `[a-z0-9-]`, avoid Windows-reserved
  names, bound length, prevent case-collisions.
- Two writers (form via desktop IPC, MCP via server) touch the same files — both go
  through the shared store + atomic writes; the file-watch unifies refresh.
- The always-on confirm costs a scoped broker (~1–1.5 days). Soft-delete makes the
  cost optional — decide modal-now vs gate+soft-delete-now.
- Codex/Cursor confirm UX rides the same broker→`dialogs.confirm` path (desktop).

## Manual test (run it yourself after the agent builds this)

Desktop, with the `03` workspace at `~/tutoratlas`. Repeat the core flow on **each**
of Claude / Cursor / Codex.

1. **Add by chat:** "add Mary, P5, takes math and science, mum is Jenny
   +65 9123 4567" → Mary appears in the roster **without refreshing**; confirm
   `~/tutoratlas/students/mary-.../student.json` exists.
2. **Query:** "who do I teach taking math?" → the agent lists Mary (used a tool, not
   a guess).
3. **Update (confirm):** "update Ryan's school to RI" → a confirm prompt appears →
   approve → the roster row updates live.
4. **Delete (confirm + recoverable):** "drop the Tan kid" → confirm prompt → approve
   → the row disappears; verify the folder moved to `~/tutoratlas/.trash/` (not gone).
5. **No direct edits:** confirm the agent did **not** rewrite `student.json` itself —
   every change came through a tool call.
6. **Form parity:** add/edit/delete a student via the form → still works; roster
   stays consistent with the chat-made changes.
7. **Migration:** on a machine that had the old `~/.t3/.../students.json`, after
   upgrade the per-student files exist and the old file is renamed `.bak`.
8. **Bad input:** ask to add a student with a malformed phone → the tool rejects /
   asks to fix, rather than writing an invalid record.

## Out of scope

Knowledge-base / worksheet flows; provider onboarding; OpenCode (no MCP).
