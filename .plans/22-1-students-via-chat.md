# 22-1 — Students via Chat (Natural-language CRUD through `/student`)

## Goal

Let a tutor manage their students by talking to the AI in the existing chat
instead of (only) filling out the form. Typing `/student` primes the agent and
turns on a **student toolkit** the agent can call to list, look up, create,
update, and delete students from natural language ("add Mary, P5, takes math and
science, mum is Jenny +65 9123 4567").

The form from plan 22 **stays** — this is an additive, faster on-ramp, not a
replacement.

## Relationship to plan 22 and the iteration map

This is a sub-iteration of [22 — Student Workspace](./22-student-workspace.md).
Plan 22 ("Iteration B") built the isolated Students module: contracts, desktop
persistence (`students.json`), the browser `localStorage` fallback, IPC, the
`/students` route, and the form.

22-1 pulls **part of Iteration C forward**: the chat becomes able to *act on*
student data through tools. It deliberately does **not** yet inject a selected
student's context into coding prompts or add a "Chat about this student" button
(still C). It only wires the agent ↔ student-store action seam.

Operative constraint, same as plan 22: **ship fast**, reuse proven patterns
(the existing MCP toolkit + broker), keep the surface isolated.

## Decisions log (resolved during requirements grilling)

| # | Decision | Choice |
|---|----------|--------|
| 1 | How the AI mutates students | **Student MCP toolkit** on the existing coding agent. The agent "sees the CRUD commands" = MCP tools. Reuses `apps/server/src/mcp` infra. |
| 2 | Provider scope | **All MCP-capable providers.** A single toolkit registration is automatically visible to **Claude, Codex, and Cursor** (all three already receive MCP config). **OpenCode has no MCP** → hide/disable `/student` there. |
| 3 | Store access seam | **Broker → client → `localApi`.** The MCP handler calls back into the running app (preview-toolkit broker pattern); the client performs the read/write through the same `localApi.persistence.getStudents/setStudents` the Students page uses. Works in **desktop and web**, single persistence path, no dual-writer race, enables live UI refresh. |
| 4 | CRUD scope | **Full CRUD**: `listStudents`/`findStudents`, `getStudent`, `createStudent`, `updateStudent`, `deleteStudent`. |
| 5 | Write safety | **Confirm destructive only.** `create` auto-applies (recoverable). `update` and `delete` pause for confirmation via the existing tool-approval round-trip before persisting. |
| 6 | `/student` UX | **Primer in the main chat.** `/student` is a slash command (like `/model`, `/plan`) that inserts a short primer and enables the student tools for that turn. Tools stay **dormant** until `/student` is used. Conversation lives in the normal chat thread. |
| 7 | Phone country representation | **Standardize on `SG`/`MY`/`CN`.** Tools use the canonical code; **fix `PhoneField`** in plan 22's form (it currently stores the dial code `"+65"` in the `country` field, which breaks `links.ts` deep links). |
| 8 | Disambiguation | Tools key off **`StudentId`**. `findStudents`/`listStudents` return id + identifying fields; the agent disambiguates duplicate names by asking the user. |
| 9 | Validation enforcement | **Extract plan 22's form validation/normalization into a shared pure module**, reused by the form AND the tool write path, so the agent cannot bypass `name`-required, postal-code-6-digits-when-partial, empty-parent-drop, subject splitting. |
| 10 | Capability gating | Add a **`"students"` MCP capability** mirroring the existing `"preview"` capability; enabled for the thread when `/student` is invoked. |

## Architecture & data flow

The agent never touches the student store directly. It calls an MCP tool; the
tool's handler (in `apps/server`) brokers a request to the running client; the
client applies it through the existing `localApi` persistence path (the same one
the Students page uses), enforces validation, and returns the result.

```
User types "/student add Mary, P5, math…" in the chat composer
   │  (slash command injects a primer + flags the students capability)
   ▼
thread.turn.start  →  coding agent (Claude / Codex / Cursor)
   │  agent decides to call a student tool
   ▼
HTTP MCP server (apps/server/src/mcp)  →  Students toolkit handler
   │  broker.invoke({ op: "create", input })       (create: apply)
   │  update/delete → existing approval round-trip → broker.invoke(...)
   ▼
StudentsBroker  →  WebSocket  →  renderer (client handler)
   │  validate + normalize (shared module)
   ▼
localApi.persistence.getStudents() / setStudents(list)
   ▼
desktop: desktopBridge → DesktopStudents → students.json
web:     localStorage  (t3code:student-registry:v1)
   │
   └─►  returns result to handler → agent reports what changed;
        Students page refreshes live.
```

Why broker (not direct file access from the server): the MCP server is a
**separate child process** (`apps/desktop/src/backend/DesktopBackendManager.ts`)
and the store lives in the desktop main process / browser `localStorage`. The
broker keeps **one** persistence path, works in web mode (where there is no
`students.json`), and avoids last-write-wins races with the form.

## What already exists (no new infra needed)

- **MCP server + toolkit pattern** — `apps/server/src/mcp/McpHttpServer.ts`
  registers toolkits; `apps/server/src/mcp/toolkits/preview/{tools,handlers}.ts`
  is the template (`Tool.make` + `Toolkit.make` + handler layer).
- **Broker pattern** — `apps/server/src/mcp/PreviewAutomationBroker.ts` +
  `McpInvocationContext` route a tool request to the client and await a response.
  The new `StudentsBroker` mirrors it.
- **MCP delivered to every provider** — no per-provider work:
  Claude `ClaudeAdapter.ts:3449` (SDK `mcpServers`), Codex `CodexAdapter.ts:1389`
  (CLI `-c mcp_servers.t3-code.*` + `T3_MCP_BEARER_TOKEN`), Cursor
  `CursorAdapter.ts:534` (`mcpServers` array). Credentials issued once in
  `ProviderService.ts:~217` via `McpSessionRegistry`.
- **Capability flag** — `McpSessionRegistry` already carries capabilities
  (currently `"preview"`); add `"students"`.
- **Slash command surface** — `apps/web/src/components/chat/ChatComposer.tsx`
  (~935–990) has built-in commands (`/model`, `/plan`, `/default`) and provider
  commands (`ServerProviderSlashCommand`, `packages/contracts/src/server.ts:76`);
  selecting one inserts text into the composer (~1595).
- **Client persistence API** — `apps/web/src/localApi.ts` already exposes
  `persistence.getStudents` / `setStudents` (built in plan 22).
- **Tool approval round-trip** — `ThreadApprovalRespondCommand` /
  `thread.approval.respond` (`apps/server/src/orchestration/decider.ts:~486`,
  `packages/contracts/src/orchestration.ts`). Used for `update`/`delete`.

## Work breakdown (file-by-file)

### 1. Shared validation/normalization (prereq for clean reuse)
- **New** `apps/web/src/components/students/studentFormLogic.ts` — extract the
  pure functions currently inline in `StudentForm.tsx`:
  `phoneValueToContract`, `addressValueToContract`, `parentsToContract`
  (empty-parent drop), postal-code validation, subject splitting, `name`
  required. Export a single `normalizeAndValidateStudentInput(raw)` →
  `{ student } | { errors }`.
- **Edit** `apps/web/src/components/students/StudentForm.tsx` — call the shared
  module instead of its private copies (no behavior change).

### 2. Phone country fix (decision 7)
- **Edit** `apps/web/src/components/students/PhoneField.tsx` — make the `<Select>`
  `value` the country **code** (`"SG"`/`"MY"/"CN"`, default `"SG"`) and render the
  dial code as the label. `StudentForm`'s `phoneValueFrom/ToContract` already map
  `countryCode ↔ country`, so contracts then store `"SG"`; `StudentDetail` and
  `links.ts` (which expect `"SG"`) start working.
- **Note** a one-line tolerance for any already-saved `"+65"` values (map dial
  code → code on read) so existing data isn't broken.

> Status: decision 7 was applied ahead of this plan (PhoneField + contract
> `CountryCode` union + `StudentDetail` display were fixed, and a
> `links.test.ts` regression guard added). The read-tolerance was intentionally
> **not** added. Treat §1 (shared module) as the remaining prerequisite.

### 3. Student tool input/output contracts
- **New** `packages/contracts/src/studentTools.ts` (or extend
  `students.ts`) — `effect/Schema` request/response shapes for each op
  (`create`/`update`/`delete`/`get`/`list`/`find`), mirroring `Student`. Country
  is `Schema.Literal("SG","MY","CN")` (now available as `CountryCode`).

### 4. Server — Students MCP toolkit
- **New** `apps/server/src/mcp/toolkits/students/tools.ts` — `Tool.make` for
  `listStudents`, `findStudents`, `getStudent`, `createStudent`,
  `updateStudent`, `deleteStudent`. Descriptions tell the agent: key off
  `StudentId`; ask the user to disambiguate duplicate names; `update`/`delete`
  require confirmation.
- **New** `apps/server/src/mcp/toolkits/students/handlers.ts` — each handler
  calls `StudentsBroker.invoke({ op, input })`. `update`/`delete` first go
  through the approval round-trip; on rejection, return a "cancelled" tool result.
- **Edit** `apps/server/src/mcp/McpHttpServer.ts` — register the toolkit
  (mirror `PreviewToolkitRegistrationLive`), gated by the `"students"`
  capability.

### 5. Server — Students broker
- **New** `apps/server/src/mcp/StudentsBroker.ts` — mirror
  `PreviewAutomationBroker`: `invoke(request)` routes to the client over WS and
  awaits the response. Reuse `McpInvocationContext` for session scoping.

### 6. Capability
- **Edit** `apps/server/src/mcp/McpSessionRegistry.ts` (and the capability type)
  — add `"students"`. Enable it for the thread when `/student` is used.

### 7. Client — broker request handler
- **New** `apps/web/src/students/studentToolBridge.ts` (or alongside the route)
  — subscribe to `StudentsBroker` requests over WS; for each op:
  `getStudents()` → apply (`create`/`update`/`delete` rebuild the list,
  `findStudents`/`get` are read-only) → `normalizeAndValidateStudentInput` →
  `setStudents(list)` → return result (created/updated student or validation
  errors). Generate `id` via `crypto.randomUUID()` on create; set
  `createdAt`/`updatedAt`. On validation failure, return errors so the agent
  corrects or asks.
- **Live refresh:** publish a lightweight "students changed" signal so a mounted
  `/students` route reloads (small store or event the route subscribes to).

### 8. `/student` slash command
- **Edit** `apps/web/src/components/chat/ChatComposer.tsx` — register `/student`
  in the slash menu; selecting it (a) inserts a short primer, and (b) flags the
  turn to enable the `"students"` capability. Hide/disable the entry when the
  selected provider is **OpenCode** (no MCP).
- Define the primer text (schema summary + "use the student tools; confirm
  before updating/deleting; ask to disambiguate duplicate names").

## Testing

- **Shared logic:** unit-test `normalizeAndValidateStudentInput` (name required,
  postal-6-digit-when-partial, empty-parent drop, subject split, phone country).
- **Phone fix:** `PhoneField` stores `"SG"`; `whatsAppLink`/`telegramLink` now
  produce `wa.me/65…` / `t.me/+65…`; legacy `"+65"` tolerated on read.
- **Toolkit handlers:** unit-test each op against a fake broker — happy path,
  validation-error passthrough, `update`/`delete` approval accept + reject.
- **Broker:** request/response round-trip + session scoping (mirror preview
  broker tests).
- **Client bridge:** create/update/delete/list/find against an in-memory
  `localApi`; assert `setStudents` receives the correct whole list.
- **Manual:** `/student add …` (auto-applies, appears in roster live);
  `/student rename / change subjects …` (confirmation prompt → persists);
  `/student delete …` (confirmation → removed); duplicate-name disambiguation;
  OpenCode hides `/student`.

## Out of scope (deferred)

- Injecting a selected student's context into coding prompts; "Chat about this
  student" button (still **Iteration C**).
- OpenCode support (no MCP) — `/student` hidden there.
- Bulk import from files/spreadsheets; parents/schools as first-class entities;
  non-Singapore addresses; multi-user/auth/sync.
- Any new direct (non-CLI) LLM call path — not needed; the existing agent +
  toolkit does the work.

## The C seam (design-for, don't build)

- The `StudentsBroker` + capability flag are the same mechanism C will use to let
  the agent *read* student context into a coding/tutoring conversation.
- Standardized `SG/MY/CN` phone codes make the C-iteration WhatsApp/Telegram deep
  links work with no further change.
- Keeping one persistence path (`localApi`) means C never has to reconcile a
  second copy of the roster.

## Suggested build order (each independently shippable)

1. Extract shared validation module (§1) — pure refactor, no behavior change.
2. Phone country fix (§2) — **already done** ahead of this plan; verify only.
3. Tool contracts (§3).
4. Server toolkit + broker + capability (§4–6), read-only ops first
   (`list`/`find`/`get`) to prove the round-trip.
5. Client bridge (§7) — wire reads, then `create`, then `update`/`delete` with
   approval + live refresh.
6. `/student` slash command + primer + OpenCode gating (§8).
7. Tests throughout.
