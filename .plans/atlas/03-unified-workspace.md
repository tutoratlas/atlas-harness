# 03 — Unified Workspace

**Phase 1 — the foundation. Build solo, land before the UI parts of 04 & 06.**

## Goal

Today the app (inherited from T3Code) makes the user pick an arbitrary project
folder to chat in. Non-technical tutors don't need that. Replace it with **one
fixed, auto-loaded workspace at `~/tutoratlas`** and strip the folder/project
picker. The agent always runs in the workspace; per-student work roots at that
student's subfolder.

Good news from the code audit: a **single-project auto-bootstrap already exists**
server-side and just needs enabling — so this is mostly *configuration + hiding
UI*, not new infrastructure.

## What the tutor sees

They open the app and land **straight in their workspace** — no "open folder", no
"add project", no environment switcher. Adding/opening a student roots a chat
session at `~/tutoratlas/students/<slug>/`.

## Two roots (keep them separate)

- **The workspace** `~/tutoratlas` — visible, portable, the **agent's root** and
  the tutor's content (students, materials, skills). Overridable via a
  `TUTORATLAS_WORKSPACE` env/setting.
- **App-data** `baseDir` (= `T3CODE_HOME`, e.g. the OS app-data dir) — hidden app
  machinery (settings, `students.json` today, tokens, logs). **Stays where it is.**

These are different directories. The whole job below is making the *workspace* one
fixed visible folder and pointing the agent at it.

## How it works today (read before changing)

- **Session cwd** is resolved by `resolveThreadWorkspaceCwd`
  (`apps/server/src/checkpointing/Utils.ts:12-28`) as **`thread.worktreePath ??
  project.workspaceRoot`**. It is independent of which project/env is "selected" in
  the UI and of how many projects exist — used by
  `orchestration/Layers/ProviderCommandReactor.ts:468-482`. **Hiding pickers does
  not change cwd resolution.**
- **A new thread** roots in `defaultProjectRef` = first of `orderedProjects`
  (`apps/web/src/hooks/useHandleNewThread.ts:169-183`). With exactly one project,
  that's always the workspace. `handleNewThread(ref, { worktreePath })` is how a
  per-student session roots at a subfolder — already how "Generate materials" works.
- **Auto-bootstrap** `resolveAutoBootstrapWelcomeTargets`
  (`apps/server/src/serverRuntimeStartup.ts:173-243`) creates **exactly one**
  project + thread at the server cwd, idempotently (dedupes by `workspaceRoot`).
  It's gated by `serverConfig.autoBootstrapProjectFromCwd`, which **defaults to
  `false` in desktop mode** (`apps/server/src/cli/config.ts:301-309`). The web
  welcome handler then auto-selects the env and navigates into that thread
  (`apps/web/src/routes/__root.tsx:295-341`).
- **The local environment** always exists on desktop (the embedded server returns a
  descriptor via `ensurePrimaryEnvironmentReady`) — nothing to create, no env
  picker needed.
- **Student folders** currently go to `<baseDir>/workspace/students/<slug>/`
  (`apps/desktop/src/workspace/DesktopWorkspace.ts:66`), but the server cwd is
  `homeDirectory` (`apps/desktop/src/app/DesktopEnvironment.ts:193`). **These don't
  match** — both must become `~/tutoratlas`.

## Key approach: neutralize, don't remove

The project/environment/worktree model is load-bearing. **Don't delete the
concept.** Auto-create one hidden project at `~/tutoratlas`, force it as the
default, and **hide** every picker (guard out / early-return), keeping all the
plumbing. See "Load-bearing" below for what must stay.

## Build it

1. **One workspace-root source of truth** *(desktop)* — in
   `apps/desktop/src/app/DesktopEnvironment.ts`, resolve and expose
   `workspaceRoot = TUTORATLAS_WORKSPACE ?? path.join(homeDirectory, "tutoratlas")`
   (`os.homedir()` + `path.join`). Use it everywhere below.
2. **Point the server cwd at it** *(desktop)* —
   `DesktopEnvironment.ts:193`: set `backendCwd` to `workspaceRoot` (the dir is
   `mkdir -p`'d at `cli/config.ts:281`). This makes the auto-bootstrapped project
   root at `~/tutoratlas`.
3. **Enable the single-project auto-bootstrap** *(desktop)* —
   `apps/desktop/src/backend/DesktopBackendConfiguration.ts:105`: add
   `T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: "true"` to the child `env`. This turns
   on `serverRuntimeStartup.ts:173-243` → exactly one project + thread at the
   workspace, idempotent. **No change to `serverRuntimeStartup.ts` itself.**
4. **Align student folders to the workspace** *(desktop)* —
   `DesktopWorkspace.ts:66`: change `workspaceRoot` from
   `join(baseDir, "workspace")` to the shared `workspaceRoot` from step 1, so
   `ensureStudentWorkspace` writes `~/tutoratlas/students/<slug>/`. Keep its
   idempotent create + AGENTS.md seeding.
5. **Scaffold `.atlas/`** *(desktop)* — extend `DesktopWorkspace` (or a small
   bootstrap run on startup) to ensure `~/tutoratlas/.atlas/skills/{app,personal}/`
   exists and copy the **shipped `app/` skills** into it on init, version-stamped
   and idempotent (don't clobber tutor edits). *(Rendering assets — print.css,
   fonts — are bundled in the app, NOT seeded here; see `02`.)*
6. **Sanitize the slug** *(desktop)* — `apps/desktop/src/ipc/methods/workspace.ts:24`
   currently uses `slug = input.studentId` verbatim. Replace with a sanitized
   lowercase `[a-z0-9-]` slug (bounded length; avoid Windows-reserved names). This
   sanitizer is **shared with `04`** — put it in one place both can import.
7. **Hide the picker UI** *(web — neutralize, keep plumbing)*:
   - `apps/web/src/components/CommandPalette.tsx:1011-1038` — guard out the
     `action:add-project` registration (removes add / browse-local / remote-clone /
     env-chooser from the palette). **Keep** `handleAddProject` (1062-1160) + the
     `project.create` command path — just no UI trigger.
   - `apps/web/src/components/Sidebar.tsx:2822-2837` — hide the "Add project" button
     (and drop the `openAddProject` wiring at 2948/3569).
   - `apps/web/src/components/Sidebar.tsx:1525-1630` — neutralize the project context
     menu (rename / group / copy-path / delete) — early-return / render nothing.
   - *(optional)* `Sidebar.tsx:2841-2884` — hide the drag-reorder branch (one
     project needs no reordering).
   - **Keep** the per-project "+" new-thread button (`Sidebar.tsx:2148-2177`) — it's
     the student-session entry point.
8. **Verify dispatch unchanged** — confirm a session still resolves cwd via
   `worktreePath ?? workspaceRoot` and that "Generate materials" roots a thread at
   `students/<slug>/`. No change expected here; just prove it.
9. **Smoke test** — see Manual test.

## Load-bearing — do NOT remove (hide/force-default only)

- `serverRuntimeStartup.ts:173-243` auto-bootstrap + its driver (`360-397`) — this
  *replaces* the add-project UI; it creates the one project/thread.
- `CommandPalette.tsx:1062-1160 handleAddProject` + the `project.create` command
  shape — keep the plumbing even with no UI trigger.
- `checkpointing/Utils.ts:12-28 resolveThreadWorkspaceCwd` + the `worktreePath`
  field across `types.ts`/`store.ts`/`useHandleNewThread.ts`/`ws.ts` — the real cwd
  resolver and the per-student subfolder mechanism.
- `store.ts setActiveEnvironmentId` + `__root.tsx:295-341` welcome handler — selects
  the single env and routes into the bootstrap thread.
- `ensurePrimaryEnvironmentReady` (`environments/primary/context.ts:100-117`) + the
  `__root.tsx beforeLoad` gate — guarantees the local environment exists.

## Done when

- [ ] First launch on a clean machine creates `~/tutoratlas` with `.atlas/skills/`
      populated (shipped `app/` skills), and **one** project + thread auto-open.
- [ ] No project / folder / environment picker is visible anywhere (palette,
      sidebar button, context menu).
- [ ] Chat works rooted at the workspace; asking the agent to write a file lands it
      under `~/tutoratlas`.
- [ ] Opening a student roots a session at `~/tutoratlas/students/<slug>/`.
- [ ] Re-launch is idempotent (no duplicate project; existing content preserved).
- [ ] `TUTORATLAS_WORKSPACE` override relocates the workspace.

## Cross-OS / risks

- `os.homedir()` + `path.join`; robust folder-create error handling.
- **Two roots stay separate** — workspace (`~/tutoratlas`, visible) vs app-data
  (`T3CODE_HOME`, hidden). Don't move app state into the workspace here (the roster
  move is `04`).
- Slug sanitization is shared with `04` — lowercase `[a-z0-9-]`, avoid Windows
  reserved names, bound length, prevent case-collisions.
- **Failure mode:** if auto-bootstrap is misconfigured, no project exists →
  `defaultProjectRef` is `null` → `handleNewThread` can't root a thread. The Done-when
  "one project auto-opens" check catches this.

## Manual test (run it yourself after the agent builds this)

Desktop only (the workspace lives on the local machine).

1. **Simulate a clean machine:** quit the app, `rm -rf ~/tutoratlas` (back up first
   if needed).
2. **Launch** the desktop app. Confirm `~/tutoratlas/` now exists with
   `.atlas/skills/app/` populated and a `students/` dir; the app opens **straight
   into a chat** (no folder/project prompt).
3. **No pickers:** open the command palette → there is **no** "Add project". In the
   sidebar there's no add-project button and right-clicking the project shows no
   rename/delete menu. No environment switcher.
4. **Agent runs in the workspace:** in chat, ask the agent to create a file →
   confirm it appears under `~/tutoratlas/`.
5. **Per-student rooting:** add/open a student → **Generate materials** → confirm
   `~/tutoratlas/students/<slug>/` is created and the new session is rooted there
   (ask the agent to write a file → it lands in that subfolder).
6. **Idempotent relaunch:** quit and relaunch → same single project, content intact,
   no duplicate project created.
7. **Override:** set `TUTORATLAS_WORKSPACE=/tmp/atlas-test`, relaunch → the workspace
   is created there instead.
8. **Slug safety:** a student whose name has spaces/punctuation produces a clean
   `[a-z0-9-]` folder name (no spaces, no illegal chars).

## Out of scope

Multiple workspaces; remote/SSH environments; provider onboarding; moving the
roster into per-student files (that's `04`).
