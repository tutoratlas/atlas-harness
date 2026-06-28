import {
  Student,
  StudentId,
  StudentToolError,
  deriveStudentSlug,
} from "@t3tools/contracts";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import {
  StudentToolkit,
  type CreateStudentInput,
  type DeleteStudentInput,
  type FindStudentsInput,
  type GetStudentInput,
  type UpdateStudentInput,
} from "./tools.ts";

const StudentJson = fromLenientJson(Student);
const decodeStudentJson = Schema.decodeEffect(StudentJson);
const encodeStudentJson = Schema.encodeEffect(StudentJson);

const getWorkspaceRoot = Effect.gen(function* () {
  const scope = yield* McpInvocationContext.requireMcpCapability("students");
  const snapshotQuery = yield* ProjectionSnapshotQuery;
  const contextOption = yield* snapshotQuery.getThreadCheckpointContext(scope.threadId);

  if (Option.isNone(contextOption)) {
    return yield* new StudentToolError({
      message: `Thread ${scope.threadId} not found`,
    });
  }

  return contextOption.value.workspaceRoot;
});

const scanStudentsDirectory = Effect.gen(function* () {
  const workspaceRoot = yield* getWorkspaceRoot;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const studentsDir = path.join(workspaceRoot, "students");

  // Check if students directory exists
  const studentsExists = yield* fileSystem.exists(studentsDir);
  if (!studentsExists) {
    return [];
  }

  // Read student folder names
  const entries = yield* fileSystem.readDirectory(studentsDir).pipe(
    Effect.orElseSucceed(() => []),
  );

  const students: Student[] = [];

  for (const entry of entries) {
    const studentPath = path.join(studentsDir, entry);
    const studentJsonPath = path.join(studentPath, "student.json");

    // Check if student.json exists
    const jsonExists = yield* fileSystem.exists(studentJsonPath);
    if (!jsonExists) {
      continue;
    }

    // Read and decode student.json
    const jsonContent = yield* fileSystem.readFileString(studentJsonPath).pipe(
      Effect.option,
    );

    if (Option.isNone(jsonContent)) {
      continue;
    }

    // Try to decode, skip if invalid
    const studentOption = yield* decodeStudentJson(jsonContent.value).pipe(
      Effect.option,
    );

    if (Option.isSome(studentOption)) {
      students.push(studentOption.value);
    }
  }

  return students;
});

const findStudentByIdOrSlug = (input: { id?: StudentId; slug?: string }) =>
  Effect.gen(function* () {
    const workspaceRoot = yield* getWorkspaceRoot;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const studentsDir = path.join(workspaceRoot, "students");

    // If slug is provided, try direct lookup
    if (input.slug !== undefined) {
      const studentPath = path.join(studentsDir, input.slug);
      const studentJsonPath = path.join(studentPath, "student.json");

      const jsonExists = yield* fileSystem.exists(studentJsonPath);
      if (jsonExists) {
        const jsonContent = yield* fileSystem.readFileString(studentJsonPath);
        const student = yield* decodeStudentJson(jsonContent);
        return Option.some(student);
      }
    }

    // Otherwise scan all students
    const students = yield* scanStudentsDirectory;

    if (input.id !== undefined) {
      return Option.fromNullishOr(students.find((s: Student) => s.id === input.id));
    }

    if (input.slug !== undefined) {
      // Check if any student's workspaceFolder matches the slug
      return Option.fromNullishOr(
        students.find((s: Student) => s.workspaceFolder === `students/${input.slug}`),
      );
    }

    return Option.none();
  });

const writeStudentJson = (input: { slug: string; student: Student }) =>
  Effect.gen(function* () {
    const workspaceRoot = yield* getWorkspaceRoot;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const studentDir = path.join(workspaceRoot, "students", input.slug);
    const studentJsonPath = path.join(studentDir, "student.json");
    const tempPath = `${studentJsonPath}.${process.pid}.${yield* crypto.randomUUIDv4.pipe(Effect.map((uuid) => uuid.replace(/-/g, "")))}.tmp`;

    // Create directory
    yield* fileSystem.makeDirectory(studentDir, { recursive: true });

    // Encode student
    const encoded = yield* encodeStudentJson(input.student);

    // Write to temp file
    yield* fileSystem.writeFileString(tempPath, `${encoded}\n`);

    // Atomic rename
    yield* fileSystem.rename(tempPath, studentJsonPath);
  });

const handlers = {
  list_students: () => scanStudentsDirectory,

  find_students: (input: FindStudentsInput) =>
    scanStudentsDirectory.pipe(
      Effect.map((students: Student[]) => {
        let filtered = students;

        if (input.name !== undefined) {
          const nameLower = input.name.toLowerCase();
          filtered = filtered.filter((s: Student) =>
            s.name.toLowerCase().includes(nameLower),
          );
        }

        if (input.school !== undefined) {
          filtered = filtered.filter((s: Student) =>
            s.school !== undefined && s.school === input.school,
          );
        }

        if (input.subject !== undefined) {
          const subjectLower = input.subject.toLowerCase();
          filtered = filtered.filter((s: Student) =>
            s.subjects !== undefined &&
            s.subjects.some((sub: string) => sub.toLowerCase().includes(subjectLower)),
          );
        }

        return filtered;
      }),
    ),

  get_student: (input: GetStudentInput) =>
    Effect.gen(function* () {
      const studentOption = yield* findStudentByIdOrSlug({
        ...("id" in input && input.id !== undefined ? { id: input.id } : {}),
        ...("slug" in input && input.slug !== undefined ? { slug: input.slug } : {}),
      });

      if (Option.isNone(studentOption)) {
        return yield* new StudentToolError({
          message: `Student not found: ${"id" in input ? input.id : input.slug}`,
        });
      }

      return studentOption.value;
    }),

  create_student: (input: CreateStudentInput) =>
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const workspaceRoot = yield* getWorkspaceRoot;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      // Derive base slug
      const baseSlug = deriveStudentSlug(input.name);

      // Check for uniqueness
      const studentsDir = path.join(workspaceRoot, "students");
      let slug = baseSlug;
      let attempts = 0;
      const maxAttempts = 100;

      while (attempts < maxAttempts) {
        const candidatePath = path.join(studentsDir, slug);
        const exists = yield* fileSystem.exists(candidatePath);

        if (!exists) {
          break;
        }

        // Generate short suffix
        const suffix = yield* crypto.randomBytes(3).pipe(
          Effect.map((bytes) =>
            Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 6),
          ),
        );
        slug = `${baseSlug}-${suffix}`;
        attempts++;
      }

      if (attempts >= maxAttempts) {
        return yield* new StudentToolError({
          message: `Failed to generate unique slug for student: ${input.name}`,
        });
      }

      // Create student record
      const now = yield* DateTime.nowInCurrentZone.pipe(
        Effect.map((dt) => DateTime.formatIso(dt)),
      );
      const id = yield* crypto.randomUUIDv4;

      const student: Student = {
        id: id as StudentId,
        name: input.name,
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.parents !== undefined ? { parents: input.parents } : {}),
        ...(input.subjects !== undefined ? { subjects: input.subjects } : {}),
        ...(input.school !== undefined ? { school: input.school } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        workspaceFolder: input.workspaceFolder ?? `students/${slug}`,
        createdAt: now,
        updatedAt: now,
      };

      // Write student.json
      yield* writeStudentJson({ slug, student });

      return student;
    }),

  update_student: (input: UpdateStudentInput) =>
    Effect.gen(function* () {
      // Find existing student
      const existingOption = yield* findStudentByIdOrSlug({ id: input.id });

      if (Option.isNone(existingOption)) {
        return yield* new StudentToolError({
          message: `Student not found: ${input.id}`,
        });
      }

      const existing = existingOption.value;

      // Determine slug from workspaceFolder
      const workspaceFolder = existing.workspaceFolder ?? `students/${input.id}`;
      const slug = workspaceFolder.replace(/^students\//, "");

      // Merge changes
      const now = yield* DateTime.nowInCurrentZone.pipe(
        Effect.map((dt) => DateTime.formatIso(dt)),
      );
      const updated: Student = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.parents !== undefined ? { parents: input.parents } : {}),
        ...(input.subjects !== undefined ? { subjects: input.subjects } : {}),
        ...(input.school !== undefined ? { school: input.school } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.workspaceFolder !== undefined ? { workspaceFolder: input.workspaceFolder } : {}),
        updatedAt: now,
      };

      // Write updated student.json
      yield* writeStudentJson({ slug, student: updated });

      return updated;
    }),

  delete_student: (input: DeleteStudentInput) =>
    Effect.gen(function* () {
      const workspaceRoot = yield* getWorkspaceRoot;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      // Find student to delete
      const studentOption = yield* findStudentByIdOrSlug({
        ...("id" in input && input.id !== undefined ? { id: input.id } : {}),
        ...("slug" in input && input.slug !== undefined ? { slug: input.slug } : {}),
      });

      if (Option.isNone(studentOption)) {
        return yield* new StudentToolError({
          message: `Student not found: ${"id" in input ? input.id : input.slug}`,
        });
      }

      const student = studentOption.value;

      // Determine slug from workspaceFolder
      const workspaceFolder = student.workspaceFolder ?? `students/${"id" in input ? input.id : input.slug}`;
      const slug = workspaceFolder.replace(/^students\//, "");

      const studentDir = path.join(workspaceRoot, "students", slug);
      const timestamp = yield* DateTime.nowInCurrentZone.pipe(
        Effect.map((dt) => DateTime.formatIso(dt).replace(/[:.]/g, "-")),
      );
      const trashDir = path.join(workspaceRoot, ".trash", `${slug}-${timestamp}`);

      // Ensure .trash directory exists
      const trashParent = path.join(workspaceRoot, ".trash");
      yield* fileSystem.makeDirectory(trashParent, { recursive: true });

      // Move student folder to trash
      yield* fileSystem.rename(studentDir, trashDir);

      return null;
    }),
} as Parameters<typeof StudentToolkit.toLayer>[0];

export const StudentToolkitHandlersLive = StudentToolkit.toLayer(handlers);
