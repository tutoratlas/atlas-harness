---
name: student-manager
description: Manage student roster via MCP tools. Use when adding, querying, updating, or deleting students through natural language requests.
---

# Student Manager Skill

Use this skill to manage the student roster through conversational requests. The student manager provides six MCP tools for complete CRUD operations on student records.

## When to Use

Use these tools whenever the user asks to:

- **Add or create** a new student ("add Mary, P5, takes math and science")
- **Query or search** for students ("who do I teach on Mondays?", "show me all P5 students")
- **Look up** a specific student's details ("show me Ryan's details")
- **Update** student information ("update Ryan's school to RI")
- **Remove or delete** a student ("drop the Tan kid")
- **List all** students in the roster

## Available Tools

### 1. `list_students`

**Purpose:** List all students in the registry.

**Returns:** Complete student roster with all details.

**Use for:**
- "show me all students"
- "list everyone I teach"
- "who's in my roster?"

**Parameters:** None

**Example call:**
```json
{
  "tool": "list_students"
}
```

### 2. `find_students`

**Purpose:** Find students matching filter criteria.

**Filters:** name (partial match), school (exact match), subject (array contains). All filters are optional and combined with AND logic.

**Use for:**
- "who takes math?" → `{subject: "Math"}`
- "find students from RI" → `{school: "RI"}`
- "show me students named Tan" → `{name: "Tan"}`
- "P5 students taking science" → `{subject: "Science"}` (combine with manual filtering if needed)

**Parameters:**
```typescript
{
  name?: string,      // Partial match (case-insensitive)
  school?: string,    // Exact match
  subject?: string    // Array contains check
}
```

**Example call:**
```json
{
  "tool": "find_students",
  "parameters": {
    "subject": "Math"
  }
}
```

### 3. `get_student`

**Purpose:** Get a single student by ID or slug.

**Returns:** Full student record with all details.

**Use for:**
- "show me Ryan's details"
- "what's Mary's phone number?"
- Looking up a specific student after finding their ID

**Parameters:**
```typescript
{
  id: string          // UUID
} | {
  slug: string        // Derived from name (e.g., "mary-tan")
}
```

**Example call:**
```json
{
  "tool": "get_student",
  "parameters": {
    "slug": "mary-tan"
  }
}
```

### 4. `create_student`

**Purpose:** Create a new student record.

**Returns:** Newly created student with generated ID and timestamps.

**Use for:**
- "add Mary, P5, takes math and science, mum is Jenny +65 9123 4567"
- "create a student named Ryan from RI"
- "new student: John, takes English"

**Required:** `name` (all other fields are optional)

**Parameters:**
```typescript
{
  name: string,              // Required
  phone?: string,            // E.g., "+65 91234567"
  parents?: Array<{
    name: string,
    phone: string,
    relationship: string     // "mother", "father", "guardian"
  }>,
  subjects?: string[],       // E.g., ["Math", "Science"]
  school?: string,           // E.g., "RI", "NYGH"
  address?: {
    street: string,
    unit?: string,
    postalCode: string
  },
  notes?: string,
  workspaceFolder?: string   // Auto-set by handler if omitted
}
```

**Example call:**
```json
{
  "tool": "create_student",
  "parameters": {
    "name": "Mary Tan",
    "subjects": ["Math", "Science"],
    "parents": [{
      "name": "Jenny Tan",
      "phone": "+65 91234567",
      "relationship": "mother"
    }]
  }
}
```

### 5. `update_student`

**Purpose:** Update an existing student by ID.

**Returns:** Updated student record.

**Use for:**
- "update Ryan's school to RI"
- "change Mary's phone number to +65 98765432"
- "add Science to John's subjects"

**Required:** `id` (UUID)

**Optional:** Any student field(s) to update. Only provided fields are updated; omitted fields remain unchanged.

**⚠️ REQUIRES CONFIRMATION:** This is a destructive operation. The user will see a confirmation dialog before the update is applied.

**Parameters:**
```typescript
{
  id: string,                // Required UUID
  name?: string,
  phone?: string,
  parents?: Array<Parent>,
  subjects?: string[],
  school?: string,
  address?: SingaporeAddress,
  notes?: string,
  workspaceFolder?: string
}
```

**Example call:**
```json
{
  "tool": "update_student",
  "parameters": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "school": "RI"
  }
}
```

### 6. `delete_student`

**Purpose:** Delete a student by ID or slug.

**Returns:** `null` on success.

**Use for:**
- "drop the Tan kid"
- "remove Ryan from the roster"
- "delete student with id XXX"

**⚠️ REQUIRES CONFIRMATION:** This is a destructive operation. The user will see a confirmation dialog before deletion.

**⚠️ SOFT DELETE:** The student folder is moved to `.trash/<slug>-<timestamp>/` for recoverability, not permanently deleted.

**Parameters:**
```typescript
{
  id: string          // UUID
} | {
  slug: string        // Derived from name
}
```

**Example call:**
```json
{
  "tool": "delete_student",
  "parameters": {
    "slug": "ryan-lee"
  }
}
```

## Important Rules

### NEVER Edit Files Directly

**DO NOT** write or edit `student.json` files directly. All student data changes **MUST** go through tool calls.

❌ **WRONG:**
```typescript
// Never do this!
fs.writeFileSync('students/mary-tan/student.json', JSON.stringify(data))
```

✅ **CORRECT:**
```typescript
// Always use tools
{
  "tool": "update_student",
  "parameters": { ... }
}
```

### Data Storage Format

- Each student is stored as `students/<slug>/student.json` in the workspace
- The slug is derived from the student's name (lowercase, alphanumeric + hyphens)
- Files are validated against the `Student` contract schema
- Invalid records are skipped during listing (won't crash the roster)

### Destructive Operations

- `update_student` and `delete_student` **always** require user confirmation
- Confirmation dialogs appear regardless of provider permission mode
- Cannot be bypassed (always-on safety)
- If the user declines confirmation, the operation is cancelled

### Error Handling

- Malformed input (e.g., invalid phone numbers) returns clear error messages
- The agent should ask the user to provide corrected information
- Slug collisions are handled automatically (suffix added if needed)
- Windows-reserved names (CON, PRN, AUX, etc.) are sanitized

## Example Workflows

### Adding a New Student

**User:** "add Mary, P5, takes math and science, mum is Jenny +65 9123 4567"

**Agent flow:**
1. Parse the natural language input
2. Call `create_student` with extracted data
3. Report success: "Added Mary Tan to the roster"

### Finding Students by Subject

**User:** "who do I teach taking math?"

**Agent flow:**
1. Call `find_students` with `{subject: "Math"}`
2. List the matching students
3. Note: Used a tool call, not a guess

### Updating with Confirmation

**User:** "update Ryan's school to RI"

**Agent flow:**
1. Find Ryan's ID (via `find_students` or `get_student`)
2. Call `update_student` with `{id: "...", school: "RI"}`
3. User sees confirmation dialog
4. User approves
5. Student record updated, roster updates live

### Deleting with Recovery

**User:** "drop the Tan kid"

**Agent flow:**
1. Find the student (via `find_students` with `{name: "Tan"}`)
2. Call `delete_student` with the student's ID or slug
3. User sees confirmation dialog
4. User approves
5. Student folder moved to `.trash/` (recoverable)
6. Student removed from roster

## Natural Language Query Mapping

| User Query | Tool(s) to Use | Parameters |
|------------|----------------|------------|
| "show all students" | `list_students` | None |
| "who takes math?" | `find_students` | `{subject: "Math"}` |
| "students from RI" | `find_students` | `{school: "RI"}` |
| "find someone named Tan" | `find_students` | `{name: "Tan"}` |
| "show me Ryan's details" | First `find_students` by name, then `get_student` by ID/slug | `{name: "Ryan"}` → `{id: "..."}` |
| "add Mary, takes math" | `create_student` | `{name: "Mary", subjects: ["Math"]}` |
| "update Ryan's school to RI" | First find Ryan's ID, then `update_student` | `{id: "...", school: "RI"}` |
| "remove the Tan kid" | First find by name, then `delete_student` | `{name: "Tan"}` → `{id: "..."}` |

## Integration Notes

- The web roster updates **live** when students are added/updated/deleted (no page refresh needed)
- Form-based student management continues to work alongside these tools
- All tools require the `"students"` MCP capability (granted automatically in this workspace)
- Changes made via tools, forms, or manual file edits all trigger live roster updates

## Troubleshooting

### "Student not found" error
- Verify the ID or slug is correct
- Use `list_students` or `find_students` to locate the student first

### "Invalid phone number" error
- Phone numbers must be in international format (e.g., "+65 91234567")
- Ask the user to provide a correctly formatted number

### Confirmation timeout
- If the user doesn't respond to a confirmation dialog within 30 seconds, the operation times out
- The agent should re-attempt or ask the user to try again

### Slug collision
- If two students have the same name, a unique suffix is automatically added to the folder name
- The system handles this transparently; no agent action needed
