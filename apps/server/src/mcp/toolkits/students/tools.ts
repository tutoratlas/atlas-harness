import {
  Student,
  StudentId,
  StudentToolError,
  TrimmedNonEmptyString,
  PhoneNumber,
  Parent,
  SingaporeAddress,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [McpInvocationContext.McpInvocationContext];

// Helper functions to apply common annotations
const readonlyStudentTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.Destructive, false) as T;

const destructiveStudentTool = <T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.Destructive, true) as T;

const safeStudentTool = <T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.Destructive, false) as T;

// Input schemas for tools
export const FindStudentsInput = Schema.Struct({
  name: Schema.optionalKey(TrimmedNonEmptyString),
  school: Schema.optionalKey(TrimmedNonEmptyString),
  subject: Schema.optionalKey(TrimmedNonEmptyString),
});
export type FindStudentsInput = typeof FindStudentsInput.Type;

export const GetStudentInput = Schema.Union([
  Schema.Struct({
    id: StudentId,
  }),
  Schema.Struct({
    slug: TrimmedNonEmptyString,
  }),
]);
export type GetStudentInput = typeof GetStudentInput.Type;

export const CreateStudentInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  phone: Schema.optionalKey(PhoneNumber),
  parents: Schema.optionalKey(Schema.Array(Parent)),
  subjects: Schema.optionalKey(Schema.Array(TrimmedNonEmptyString)),
  school: Schema.optionalKey(TrimmedNonEmptyString),
  address: Schema.optionalKey(SingaporeAddress),
  notes: Schema.optionalKey(Schema.String),
  workspaceFolder: Schema.optionalKey(TrimmedNonEmptyString),
});
export type CreateStudentInput = typeof CreateStudentInput.Type;

export const UpdateStudentInput = Schema.Struct({
  id: StudentId,
  name: Schema.optionalKey(TrimmedNonEmptyString),
  phone: Schema.optionalKey(PhoneNumber),
  parents: Schema.optionalKey(Schema.Array(Parent)),
  subjects: Schema.optionalKey(Schema.Array(TrimmedNonEmptyString)),
  school: Schema.optionalKey(TrimmedNonEmptyString),
  address: Schema.optionalKey(SingaporeAddress),
  notes: Schema.optionalKey(Schema.String),
  workspaceFolder: Schema.optionalKey(TrimmedNonEmptyString),
});
export type UpdateStudentInput = typeof UpdateStudentInput.Type;

export const DeleteStudentInput = Schema.Union([
  Schema.Struct({
    id: StudentId,
  }),
  Schema.Struct({
    slug: TrimmedNonEmptyString,
  }),
]);
export type DeleteStudentInput = typeof DeleteStudentInput.Type;

// Tool definitions
export const ListStudentsTool = readonlyStudentTool(
  Tool.make("list_students", {
    description:
      "List all students in the registry. Returns the complete student roster with all details.",
    success: Schema.Array(Student),
    failure: StudentToolError,
    dependencies,
  }).annotate(Tool.Title, "List all students"),
);

export const FindStudentsTool = readonlyStudentTool(
  Tool.make("find_students", {
    description:
      "Find students matching filter criteria. Filter by name (partial match), school (exact match), or subject (array contains). All filters are optional and combined with AND logic.",
    parameters: FindStudentsInput,
    success: Schema.Array(Student),
    failure: StudentToolError,
    dependencies,
  }).annotate(Tool.Title, "Find students by filters"),
);

export const GetStudentTool = readonlyStudentTool(
  Tool.make("get_student", {
    description:
      "Get a single student by ID or slug. Returns the full student record with all details.",
    parameters: GetStudentInput,
    success: Student,
    failure: StudentToolError,
    dependencies,
  }).annotate(Tool.Title, "Get student by ID or slug"),
);

export const CreateStudentTool = safeStudentTool(
  Tool.make("create_student", {
    description:
      "Create a new student record. Requires name; all other fields are optional. Returns the newly created student with generated ID and timestamps.",
    parameters: CreateStudentInput,
    success: Student,
    failure: StudentToolError,
    dependencies,
  }).annotate(Tool.Title, "Create new student"),
);

export const UpdateStudentTool = destructiveStudentTool(
  Tool.make("update_student", {
    description:
      "Update an existing student by ID. Only provided fields are updated; omitted fields remain unchanged. Returns the updated student record.",
    parameters: UpdateStudentInput,
    success: Student,
    failure: StudentToolError,
    dependencies,
  }).annotate(Tool.Title, "Update student"),
);

export const DeleteStudentTool = destructiveStudentTool(
  Tool.make("delete_student", {
    description:
      "Delete a student by ID or slug. This permanently removes the student record from the registry.",
    parameters: DeleteStudentInput,
    success: Schema.Null,
    failure: StudentToolError,
    dependencies,
  }).annotate(Tool.Title, "Delete student"),
);

// Toolkit export
export const StudentToolkit = Toolkit.make(
  ListStudentsTool,
  FindStudentsTool,
  GetStudentTool,
  CreateStudentTool,
  UpdateStudentTool,
  DeleteStudentTool,
);
