# 22 — Student Workspace (Iteration B: Additive Roster Module)

## Goal

Give an individual tutor a place to store and manage their students inside the
Atlas harness: name, contact, parents, subjects, school, and address. This is
the first tutoring-domain feature on top of the forked t3code/codex app.

This plan covers **Iteration B** only: an additive, self-contained "Students"
module that does **not** touch the existing chat/coding-agent functionality.

## Strategic context (the three iterations)

- **B — now (this plan):** Students as an isolated module. Store + display +
  CRUD. Learn the codebase's persistence / IPC / UI patterns by copying proven
  examples. No interaction with the AI chat yet.
- **C — next:** Deep integration. Select a student → the AI chat becomes aware
  of their subjects/school/history; student data flows into prompts. A "Chat
  about this student" button bridges the dedicated Students page into the
  existing chat. The seam is designed for in B but not built.
- **A — eventual:** Strip/repurpose the coding-agent internals entirely around
  tutoring. Out of scope for a long time.

Operative constraint throughout: **ship fast**. Every decision below was made to
favor speed-to-working-feature over architectural purity, while leaving the C
seam clean.

## Decisions log (resolved during requirements grilling)

| # | Decision | Choice |
|---|----------|--------|
| 1 | App relationship | **B** — additive isolated module (C next, A eventual) |
| 2 | Persistence layer | **Desktop local JSON file** (`students.json`), copy `DesktopSavedEnvironments` pattern. No server, no DB, no event-sourcing. |
| 3a | Parents | **0-many** array of `{ name, relationship, phone }` |
| 3b | Subjects | **Array of free-text strings** (no controlled vocab) |
| 3c | School | **Single free-text string** (not its own entity) |
| 3d | Contact format | Structured phone (country + number), free text otherwise |
| 4 | Phone | **Country dropdown (SG default / MY / CN) + raw number string.** No libphonenumber. Deep-linkable to WhatsApp/Telegram in C. Applies to student contact and each parent. |
| 5 | Address | **Structured, Singapore-focused**, Google Maps-linkable |
| 5a | Address scope | **Student-level only** (not per-parent) |
| 5b | Address required-ness | **Block optional; if any field filled, postal code (6 digits) required.** Postal-code format validated only when present. |
| 6 | UI surface | **A** — dedicated "Students" top-level route + sidebar nav entry. Fully isolated from chat. |
| 7a | CRUD scope | **Full CRUD** (create/list/view/edit/delete). **No search/pagination/sort beyond alphabetical** this iteration. |
| 7b | IPC granularity | **Coarse get-all / set-all** (`getStudents`/`setStudents`), exactly like `DesktopSavedEnvironments` registry. Last-write-wins is fine for a single user. |
| 8a | Required fields | **Only `name`.** Empty parent rows auto-dropped on save. |
| 8b | ID generation | `crypto.randomUUID()` in the renderer at create time. |
| 8c | Delete | **Confirm dialog** before delete. |
| 8d | Duplicate names | **Allowed** — `id` is the key. |
| 8e | Empty state | Friendly "No students yet — add your first" + New button. |

Scale assumption: ~10-50 students per tutor, single machine, single user.

## Data model

New contracts file: `packages/contracts/src/students.ts`. Use `effect/Schema`
(the codebase's Zod equivalent) to mirror existing contract style.

```ts
// Branded id, like EnvironmentId in baseSchemas.ts
export const StudentId = Schema.String.pipe(Schema.brand("StudentId"));

export const PhoneCountry = Schema.Literal("SG", "MY", "CN");

export const PhoneNumber = Schema.Struct({
  country: PhoneCountry,        // dropdown, defaults to "SG"
  number: Schema.String,        // raw, unvalidated digits/format
});

export const Parent = Schema.Struct({
  name: Schema.String,
  relationship: Schema.String,  // free text: "Mother", "Father", "Guardian"
  phone: Schema.optionalKey(PhoneNumber),
});

// Singapore-structured address. Whole block optional; postal code is the
// gate (6 digits) when any field is present.
export const SingaporeAddress = Schema.Struct({
  block: Schema.optionalKey(Schema.String),     // "123A"
  street: Schema.optionalKey(Schema.String),    // "Ang Mo Kio Avenue 6"
  building: Schema.optionalKey(Schema.String),  // condo/building name
  unit: Schema.optionalKey(Schema.String),      // "#12-34"
  postalCode: Schema.optionalKey(Schema.String),// 6 digits
});

export const Student = Schema.Struct({
  id: StudentId,
  name: Schema.String,                          // required (non-empty)
  contact: Schema.optionalKey(PhoneNumber),
  parents: Schema.Array(Parent),                // 0-many
  subjects: Schema.Array(Schema.String),        // free-text tags
  school: Schema.optionalKey(Schema.String),
  address: Schema.optionalKey(SingaporeAddress),
  createdAt: Schema.String,                     // ISO string
  updatedAt: Schema.String,                     // ISO string
});
```

Storage document (mirrors `SavedEnvironmentRegistryDocument`):

```ts
export const StudentRegistryDocument = Schema.Struct({
  version: Schema.optionalKey(Schema.Number),   // start at 1
  students: Schema.optionalKey(Schema.Array(Student)),
});
```

Export all of the above from `packages/contracts/src/index.ts`.

### Validation rules (enforced in the form, not the schema)

- `name` non-empty → required.
- Postal code: if **any** address field is non-empty, `postalCode` must match
  `/^\d{6}$/`. Otherwise address may be fully empty.
- Parent rows that are entirely empty (no name AND no phone number) are dropped
  before save.
- No phone format validation (raw string). No name uniqueness check.

## Architecture & data flow

Same shape as saved environments. The renderer cannot touch the filesystem; it
calls `window.desktopBridge` methods handled in the Electron main process, which
reads/writes a JSON file under the app state dir.

```
Web renderer (React route)
   │  localApi.getStudents() / setStudents(list)
   ▼
preload.ts  →  ipcRenderer.invoke(GET/SET_STUDENTS_CHANNEL)
   ▼
DesktopIpcHandlers.ts  →  methods/students.ts
   ▼
DesktopStudents service (Effect layer)
   ▼
~/.t3code state dir / students.json   (atomic temp-write + rename)
```

File location: alongside `saved-environments.json` in the same state dir
(`DesktopEnvironment.ts:184`), i.e. `studentRegistryPath = path.join(stateDir, "students.json")`.

## Work breakdown (file-by-file)

### 1. Contracts — `packages/contracts/src/`
- **New** `students.ts` — schemas above.
- **Edit** `index.ts` — export `students.ts`.
- **Edit** `ipc.ts` — add to `DesktopBridge` interface:
  ```ts
  getStudents: () => Promise<Student[]>;
  setStudents: (students: readonly Student[]) => Promise<void>;
  ```

### 2. Desktop main — persistence
- **Edit** `apps/desktop/src/app/DesktopEnvironment.ts`
  - Add `readonly studentRegistryPath: string;` to the interface (near line 49).
  - Set `studentRegistryPath: path.join(stateDir, "students.json")` (near line 184).
- **New** `apps/desktop/src/settings/DesktopStudents.ts`
  - Copy `DesktopSavedEnvironments.ts` **minus all secret/encryption/SafeStorage
    code** (students have no secrets). Keep: `fromLenientJson` decode, atomic
    `writeRegistryDocument` (temp + rename), `readRegistryDocument` with
    graceful fallback to empty, `Context.Service`, `layer`, and `layerTest`.
  - Shape:
    ```ts
    getRegistry: Effect.Effect<readonly Student[]>;
    setRegistry: (students: readonly Student[]) =>
      Effect.Effect<void, DesktopStudentsWriteError>;
    ```

### 3. Desktop main — IPC
- **Edit** `apps/desktop/src/ipc/channels.ts`
  - `export const GET_STUDENTS_CHANNEL = "desktop:get-students";`
  - `export const SET_STUDENTS_CHANNEL = "desktop:set-students";`
- **New** `apps/desktop/src/ipc/methods/students.ts` — copy
  `methods/savedEnvironments.ts` (the get/set registry handlers only).
- **Edit** `apps/desktop/src/ipc/DesktopIpcHandlers.ts` — register the two
  handlers (follow the `getSavedEnvironmentRegistry`/`setSavedEnvironmentRegistry`
  registration).
- **Edit** `apps/desktop/src/preload.ts` — expose `getStudents`/`setStudents`
  on `desktopBridge` via `ipcRenderer.invoke`.
- **Edit** the desktop foundation layer (where `DesktopSavedEnvironments.layer`
  is merged into `Layer.mergeAll(...)`) — add `DesktopStudents.layer`.

### 4. Web renderer — data access
- **Edit** `apps/web/src/localApi.ts` — add `getStudents`/`setStudents`
  wrappers over the bridge, mirroring the saved-environment-registry calls.
- **State:** keep it dead simple — load the roster once on the route mount into
  local component state (or a tiny Zustand store `studentsStore.ts` if shared
  across the list + detail routes). On any mutation: update in memory → call
  `setStudents(wholeList)` → keep the in-memory copy as source of truth.
  Coarse get-all/set-all, last-write-wins.

### 5. Web renderer — routing & UI (Layout A)
- **New** `apps/web/src/routes/students.tsx` — top-level route, mirrors
  `settings.tsx`. Two-pane: left = roster list (alphabetical by name) +
  `[+ New]`; right = detail/edit pane (the selected student or the empty state).
- **New** `apps/web/src/routes/students.$studentId.tsx` *(optional)* — if the
  router style prefers a child route for the selected student; otherwise manage
  selection in `students.tsx` local state. Match whatever `settings.*` does.
- **New** `apps/web/src/components/students/`
  - `StudentList.tsx` — alphabetical list, selection, empty state (8e).
  - `StudentDetail.tsx` — read view with WhatsApp/Telegram + Map links (links
    can be stubbed/disabled in B; wired live in C). `[Edit]` `[Delete]`.
  - `StudentForm.tsx` — create/edit form. Fields: name (required), contact
    (PhoneField), subjects (tag input), school (text), address (AddressFields),
    parents (ParentRows). Validation per rules above.
  - `PhoneField.tsx` — country `<select>` (SG default / MY / CN) + number input.
  - `ParentRows.tsx` — add/remove parent rows `{ name, relationship, phone }`;
    drops empty rows on save.
  - `AddressFields.tsx` — block / street / building / unit / postalCode; postal
    code validation message when address partially filled.
- **Sidebar nav:** add a "Students" entry next to Chat/Settings (find the nav
  component rendering those links; add a route link + icon).
- **Delete confirm:** reuse the app's existing confirm/dialog primitive (same
  one used elsewhere) for the 8c confirmation.

### 6. Deep-link helpers (small, reused in C)
- `whatsAppLink(phone)` → `https://wa.me/<e164digits>` (build E.164 from country
  + number: SG `+65`, MY `+60`, CN `+86`, strip non-digits).
- `telegramLink(phone)` → `https://t.me/<...>` (or `tg://`).
- `googleMapsLink(address)` → `https://www.google.com/maps/search/?api=1&query=`
  + encoded (block + street + "Singapore" + postalCode); postal code alone is a
  reliable fallback. Put these in `components/students/links.ts`.

## Testing

- **Contracts:** `students.test.ts` — encode/decode round-trip, optional fields,
  empty-document fallback.
- **DesktopStudents:** unit test get/set round-trip via `layerTest`, atomic-write
  behavior, corrupt-file → empty fallback (mirror saved-environments tests).
- **localApi:** mirror `localApi.test.ts` for the new bridge calls.
- **Form logic:** postal-code-required-when-present, empty-parent-row dropping,
  name-required. Unit test the pure validation/normalization function.

## Out of scope (explicitly deferred)

- Any AI/chat integration (that is Iteration C).
- Server persistence, multi-device sync, multi-tutor/auth (would force the
  server + auth conversation; not needed for one tutor on one machine).
- Search, filtering, sorting beyond alphabetical, pagination.
- Sibling/parent linking (duplicate parent info across siblings is acceptable).
- Phone format validation / libphonenumber.
- Schools or subjects as first-class entities.
- Non-Singapore address structure.

## The C seam (design-for, don't build)

- Structured phone (country + number) is already enough to build WhatsApp/
  Telegram links — C just surfaces them live.
- `StudentDetail` is the natural home for a future "Chat about this student"
  button that opens the existing chat pre-seeded with student context.
- Because students live in the desktop main process already, C can inject
  student context into prompts without a server round-trip.

## Suggested build order (each independently shippable)

1. Contracts (`students.ts` + `ipc.ts` + `index.ts`).
2. Desktop persistence (`DesktopStudents.ts` + env path + layer).
3. IPC wiring (channels + method + handler + preload).
4. `localApi` bridge wrappers.
5. Route + list + empty state (read-only, hardcoded/empty data) — see it render.
6. Create/edit form + validation.
7. Delete + confirm.
8. Deep-link helpers (disabled visuals OK in B).
9. Tests throughout.
