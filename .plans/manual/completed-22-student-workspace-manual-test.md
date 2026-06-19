# Manual Test Guide — 22 Student Workspace (form/roster module)

Scope: the additive **Students** module from
[../22-student-workspace.md](../22-student-workspace.md) — store + display +
full CRUD via a form. The `/student` chat-CRUD feature (plan 22-1) is **NOT
implemented** and is out of scope.

Branch under test: `auto-claude/001-implement-student-workspace-plan`
(worktree `.auto-claude/worktrees/tasks/001-implement-student-workspace-plan`).

> ✅ **Recent fixes to retest (all in §5):**
> - **F15 / F8 phone country** — was storing dial code `"+65"`, breaking deep
>   links and showing `++65`. Now stores `"SG"`/`"MY"`/`"CN"`.
> - **F11 address validation** — partial address (e.g. street only, no postal)
>   used to save silently. Now blocked: postal required + 6 digits when any
>   address field is filled.
> - **F14 Google Maps** — query is now **block + street + postal** only, postal
>   **required**; building/unit dropped.
> - **F7 name-required** — empty-name submit now **focuses + scrolls** to the
>   Name field.
> - **F2 empty-state copy** — welcome text no longer quotes a button label.
>
> ⚠️ **No data migration.** Students created *before* the phone fix still have
> `"+65"` saved (look broken). And editing a student saved *before* F11 with a
> street-only address will now require a postal code before it saves. Retest with
> **freshly created** students, or reset the store first (§1).

---

## 1. Setup, install, and spin up the services

**Prerequisites**
- Node `^24.13.1` (`package.json` → `engines`).
- The `vp` (Vite+) CLI:
  ```bash
  curl -fsSL https://vite.plus | bash      # macOS / Linux
  ```

**Install** (run from the worktree that has the code):
```bash
cd /home/rex/projects/tutoratlas/atlas-harness/.auto-claude/worktrees/tasks/001-implement-student-workspace-plan
vp i
```

**Run — pick one surface.** Two backends (`apps/web/src/localApi.ts`): Electron
persists to a JSON file; the browser falls back to `localStorage`.

- **Desktop (recommended)** — no pairing, real IPC + `students.json`:
  ```bash
  vp run dev:desktop        # or: pnpm dev:desktop
  ```
  Data file: `find ~ -name students.json 2>/dev/null`
- **Web** — `vp run dev:web`, open the printed URL. ⚠️ `/students` has an auth
  guard (`routes/students.tsx`): if not paired it redirects to `/pair`. Data:
  `localStorage` key `t3code:student-registry:v1`.

**Reset to a clean state** (important for retesting the fixes):
- Desktop: delete `students.json`.
- Web: clear the `t3code:student-registry:v1` localStorage key.

**Automated tests** (run these first — they guard the fixes above):
```bash
vp run --filter @t3tools/contracts test   # schema rejects "+65"
vp run --filter @t3tools/desktop test      # DesktopStudents
vp run --filter @t3tools/web test          # links.test.ts (F8/F14/F15),
                                            # studentFormValidation.test.ts (F7/F11),
                                            # studentsCopy.test.ts (F2)
vp run --filter @t3tools/web typecheck
```

---

## 2. Features to test (each is its own unit)

Navigation & shell
- **F1** — Sidebar "Students" nav entry (`Sidebar.tsx`, Users icon → `/students`)
- **F2** — Two-pane Students page + empty state (`routes/students.tsx`, `StudentList.tsx`) — **copy updated**

CRUD (one letter = one feature)
- **F3 — Create** (`StudentForm` create mode)
- **F4 — Read**: alphabetical roster + detail view (`StudentList`, `StudentDetail`)
- **F5 — Update**: edit existing (`StudentForm` edit mode)
- **F6 — Delete**: with confirm dialog (`StudentDetail.handleDelete`)

Form fields & validation
- **F7** — Name required, now with focus/scroll (`StudentForm.tsx`) — **updated**
- **F8** — Phone field: country code dropdown (SG/MY/CN) + number (`PhoneField.tsx`) — **fixed**
- **F9** — Subjects: comma-separated → tag chips
- **F10** — School: free text
- **F11** — Address: postal required + 6 digits when partially filled (`AddressFields.tsx`, `studentFormValidation.ts`) — **fixed**
- **F12** — Parents: add/remove rows; empty rows dropped on save (`ParentRows.tsx`)
- **F13** — Notes: free text

Deep links
- **F14** — Google Maps link from address (`links.ts:googleMapsLink`) — **changed**
- **F15** — WhatsApp / Telegram links from phone (`links.ts`) — **fixed** ✅

Persistence
- **F16** — Round-trip persistence (survives reload; coarse get-all/set-all)

---

## 3. Acceptance criteria per feature

| # | Feature | Acceptance |
|---|---------|-----------|
| F1 | Sidebar nav | A "Students" item (Users icon) appears in the sidebar footer; clicking it opens the Students page. |
| F2 | Empty state | Left pane: "No students yet" + **"Add your first student"**. Right pane welcome: "Select a student from the list to view details" / **"or add a new one to get started"** (no quoted button label). Header button: **"New Student"**. |
| F3 | Create | Submitting with a name adds the student, auto-selects it, shows its detail. |
| F4 | Read | Roster **sorted alphabetically by name**; clicking a name shows full detail. |
| F5 | Update | Edit pre-fills all values; saving updates the record and bumps "Last updated"; `id`/`createdAt` preserved. |
| F6 | Delete | Confirm dialog naming the student; confirm removes it; cancel keeps it. |
| F7 | Name required | Empty/whitespace name blocks save, shows "Name is required", **and the Name field is focused + scrolled into view**. |
| F8 | Phone | Dropdown defaults to **SG**, offers MY / CN (`CODE +dial`). **Detail shows a single dial code, e.g. `+65 91234567` (NOT `++65`).** |
| F9 | Subjects | `Math, Physics` → two chips; spaces/empties trimmed. |
| F10 | School | Saved value shown in detail. |
| F11 | Address | Empty address → saves. **Any field filled but postal empty → blocked: "Postal code is required when an address is entered".** Postal present but not 6 digits → blocked: "Postal code must be 6 digits". Postal-only (6 digits) → saves. |
| F12 | Parents | Add/remove rows; fully empty row dropped on save; rows with name and/or phone kept. |
| F13 | Notes | Multi-line notes saved and shown (whitespace preserved). |
| F14 | Maps link | Button shows **only when a postal code is present**. Opens a maps search for **block + street + `Singapore <postal>`**; building & unit are NOT in the URL. |
| F15 | WhatsApp/Telegram | For a student with a phone, buttons appear and open `https://wa.me/6591234567` / `https://t.me/+6591234567`. |
| F16 | Persistence | Created/edited/deleted students survive a full app reload. |

---

## 4. How to test each feature

**F1 — Sidebar nav:** Launch → sidebar footer (near Settings) → click **Students** → lands on Students page.

**F2 — Empty state (copy updated):** Clean profile → open Students. Left: "No students yet" + **"Add your first student"**. Right: welcome text ending **"or add a new one to get started"** — confirm it does **not** quote a button name. Header shows **"New Student"**. (See §5.5.)

**F3 — Create:** **New Student** → type only a name → **Create Student** → appears in list, opens detail.

**F4 — Read / list:** Create "Zoe", "Adam", "Mia" → expect order Adam → Mia → Zoe → click each → detail loads.

**F5 — Update:** Open a student → **Edit** → change school/subjects → **Save Changes** → updated values, newer "Last updated", "Created" unchanged.

**F6 — Delete:** Open a student → **Delete** → confirm dialog → Cancel keeps it; Delete → confirm removes it, view returns to welcome.

**F7 — Name required (updated):** see §5.4.

**F8 — Phone (fixed):** see §5.1.

**F9 — Subjects:** `Math, Physics , , Chemistry` → save → exactly three chips.

**F10 — School:** Enter a school → save → shown under "School".

**F11 — Address (fixed):** see §5.2.

**F12 — Parents:** **Add parent** ×2; fill row 1 (name "Mary", "Mother"), leave row 2 empty → save → reopen → only Mary remains. Test **Remove parent** (X).

**F13 — Notes:** Multi-line notes → save → line breaks preserved.

**F14 — Google Maps (changed):** see §5.3.

**F15 — WhatsApp/Telegram (fixed):** see §5.1.

**F16 — Persistence:** Create/edit a couple → fully quit & relaunch (desktop) or hard-reload (web) → roster intact. Verify raw store: desktop `cat "$(find ~ -name students.json)"`; web localStorage `t3code:student-registry:v1`.

---

## 5. Fix verification (retest after the recent changes)

Reset the store first (§1) so pre-fix records don't interfere.

### 5.1 Phone country — F8 + F15

Automated: `vp run --filter @t3tools/web test` (`links.test.ts`) + `vp run --filter @t3tools/contracts test`.

1. New Student → Name "Link Test" → Phone: country **SG** (default), number `91234567` → Create.
2. **Detail (F8):** phone reads **`+65 91234567`** — exactly one `+` (a `++65` = regression).
3. **Deep links (F15):** **WhatsApp** + **Telegram** buttons are visible. WhatsApp → `https://wa.me/6591234567`; Telegram → `https://t.me/+6591234567`.
4. Edit → switch to **MY** `123456789` → `+60 …`, `wa.me/60123456789`; **CN** `13800138000` → `+86 …`, `wa.me/8613800138000`.
5. Parent phone (SG) → parent block also shows single `+65 …` with working buttons.

### 5.2 Address validation — F11

Automated: `vp run --filter @t3tools/web test` (`studentFormValidation.test.ts`).

1. New Student → Name "Addr Test". Address: fill **Street only**, leave Postal blank → **Create** → **blocked**, message **"Postal code is required when an address is entered"**.
2. Postal `12345` (5 digits) → **blocked**, "Postal code must be 6 digits".
3. Postal `123456` → **saves**.
4. New Student with **only** Postal `560123` (no other field) → **saves**.
5. New Student with a name and a fully empty address → **saves** (no address stored).
6. (Regression caveat) Editing a student saved before this fix that has street-only will now require a postal before save — expected.

### 5.3 Google Maps query — F14

Automated: `vp run --filter @t3tools/web test` (`links.test.ts`).

1. Student with address block `123`, street `Ang Mo Kio Avenue 6`, building `Sunrise Condo`, unit `#12-34`, postal `560123`.
2. Detail → **Open in Google Maps** is present → the URL query contains **`Blk 123`**, the **street**, and **`Singapore 560123`**, and does **NOT** contain `Sunrise Condo` or `#12-34`.
3. Edit → clear the postal code (keep street) → save is blocked by F11; to test the no-postal link path, create a record with postal then remove via the store, or trust the automated test: **no postal ⇒ the "Open in Google Maps" button does not appear.**

### 5.4 Name-required focus/scroll — F7

Automated: `vp run --filter @t3tools/web test` (`studentFormValidation.test.ts`).

1. New Student → fill a long form (subjects, address, notes) so the Create button sits below the fold, but **leave Name blank**.
2. Scroll down → click **Create Student**.
3. Expect: no save, the **page scrolls up and the Name field receives focus** (cursor in it), with "Name is required" shown.
4. Bonus: valid Name but partial address (street, no postal) → submit jumps focus to the **Postal Code** field.

### 5.5 Empty-state copy — F2

Automated: `vp run --filter @t3tools/web test` (`studentsCopy.test.ts`).

1. Reset store → open Students.
2. Confirm: empty-state button **"Add your first student"**, header button **"New Student"**, welcome secondary line **"or add a new one to get started"** — no `"New Student"` (or any quoted button) embedded in the welcome text.

---

## 6. Results checklist

P = pass, F = fail, — = not run.

| # | Feature | Result | Notes |
|---|---------|:------:|-------|
| F1 | Sidebar nav | | |
| F2 | Empty state (copy fixed) | | §5.5 |
| F3 | Create | | |
| F4 | Read / list + detail | | |
| F5 | Update | | |
| F6 | Delete + confirm | | |
| F7 | Name required + focus (fixed) | | §5.4 |
| F8 | Phone display `+65` (fixed) | | §5.1 — new student |
| F9 | Subjects → chips | | |
| F10 | School | | |
| F11 | Address postal validation (fixed) | | §5.2 |
| F12 | Parents add/remove/drop | | |
| F13 | Notes | | |
| F14 | Google Maps query (changed) | | §5.3 |
| F15 | WhatsApp/Telegram (fixed) | | §5.1 |
| F16 | Persistence round-trip | | |

---

## Notes / out of scope
- `/student` chat CRUD (plan 22-1) is **not implemented**.
- No search / sort beyond alphabetical / pagination this iteration (by design).
- Duplicate names allowed (`id` is the key) — not a bug.
- No data migration: pre-fix phone records keep `"+65"`; pre-fix street-only
  addresses must gain a postal code on next edit. Reset or recreate to retest.
