import { Student, StudentId, CountryCode, deriveStudentSlug } from "@t3tools/contracts";
import { TrimmedNonEmptyString, IsoDateTime } from "@t3tools/contracts";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as Ref from "effect/Ref";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";

interface StudentRegistryStorageDocument {
  readonly version?: string;
  readonly students?: readonly Student[];
}

const PhoneNumberSchema = Schema.Struct({
  country: CountryCode,
  number: TrimmedNonEmptyString,
});

const SingaporeAddressSchema = Schema.Struct({
  block: Schema.optionalKey(TrimmedNonEmptyString),
  street: Schema.optionalKey(TrimmedNonEmptyString),
  building: Schema.optionalKey(TrimmedNonEmptyString),
  unit: Schema.optionalKey(TrimmedNonEmptyString),
  postalCode: Schema.optionalKey(TrimmedNonEmptyString),
});

const ParentSchema = Schema.Struct({
  name: Schema.optionalKey(TrimmedNonEmptyString),
  relationship: Schema.optionalKey(TrimmedNonEmptyString),
  phone: Schema.optionalKey(PhoneNumberSchema),
});

const StudentSchema = Schema.Struct({
  id: StudentId,
  name: TrimmedNonEmptyString,
  phone: Schema.optionalKey(PhoneNumberSchema),
  parents: Schema.optionalKey(Schema.Array(ParentSchema)),
  subjects: Schema.optionalKey(Schema.Array(TrimmedNonEmptyString)),
  school: Schema.optionalKey(TrimmedNonEmptyString),
  address: Schema.optionalKey(SingaporeAddressSchema),
  notes: Schema.optionalKey(Schema.String),
  workspaceFolder: Schema.optionalKey(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

const StudentRegistryDocumentSchema = Schema.Struct({
  version: Schema.optionalKey(Schema.String),
  students: Schema.optionalKey(Schema.Array(StudentSchema)),
});

const StudentFileSchema = StudentSchema;
const StudentFileJson = fromLenientJson(StudentFileSchema);
const decodeStudentFileJson = Schema.decodeEffect(StudentFileJson);
const encodeStudentFileJson = Schema.encodeEffect(StudentFileSchema);

const StudentRegistryDocumentJson = fromLenientJson(StudentRegistryDocumentSchema);
const decodeStudentRegistryDocumentJson = Schema.decodeEffect(StudentRegistryDocumentJson);

export class DesktopStudentsWriteError extends Data.TaggedError("DesktopStudentsWriteError")<{
  readonly cause: PlatformError.PlatformError | Schema.SchemaError;
}> {
  override get message() {
    return `Failed to write desktop students: ${this.cause.message}`;
  }
}

export interface DesktopStudentsShape {
  readonly getRegistry: Effect.Effect<readonly Student[]>;
  readonly setRegistry: (
    students: readonly Student[],
  ) => Effect.Effect<void, DesktopStudentsWriteError>;
}

export class DesktopStudents extends Context.Service<DesktopStudents, DesktopStudentsShape>()(
  "@t3tools/desktop/settings/DesktopStudents",
) {}

/**
 * Derive folder name from student record. Uses workspaceFolder if available,
 * otherwise derives slug from name + short ID suffix for uniqueness.
 */
function deriveStudentFolderName(student: Student): string {
  if (student.workspaceFolder) {
    return student.workspaceFolder;
  }
  const slug = deriveStudentSlug(student.name);
  const idSuffix = student.id.slice(-6);
  return `${slug}-${idSuffix}`;
}

/**
 * Check if two students are equal (simple updatedAt timestamp check)
 */
function studentsEqual(a: Student, b: Student): boolean {
  return a.id === b.id && a.updatedAt === b.updatedAt;
}

/**
 * Read all student files from <workspaceRoot>/students/<slug>/student.json
 */
const readStudentsFromDisk = Effect.fn("desktop.students.readStudentsFromDisk")(
  function* (input: {
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly studentsDir: string;
  }): Effect.fn.Return<readonly Student[]> {
    const { fileSystem, path, studentsDir } = input;

    const studentsDirExists = yield* fileSystem.exists(studentsDir).pipe(Effect.orElseSucceed(() => false));
    if (!studentsDirExists) {
      return [];
    }

    const entries = yield* fileSystem.readDirectory(studentsDir).pipe(Effect.orElseSucceed(() => []));
    const students: Student[] = [];

    for (const entry of entries) {
      const studentFilePath = path.join(studentsDir, entry, "student.json");
      const fileExists = yield* fileSystem.exists(studentFilePath).pipe(Effect.orElseSucceed(() => false));
      if (!fileExists) {
        continue;
      }

      const raw = yield* fileSystem.readFileString(studentFilePath).pipe(Effect.option);
      if (Option.isNone(raw)) {
        continue;
      }

      const decoded = yield* decodeStudentFileJson(raw.value).pipe(Effect.option);
      if (Option.isSome(decoded)) {
        students.push(decoded.value);
      }
    }

    return students;
  },
);

/**
 * Write a single student file atomically (temp + rename)
 */
const writeStudentFile = Effect.fn("desktop.students.writeStudentFile")(
  function* (input: {
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly studentDir: string;
    readonly student: Student;
    readonly suffix: string;
  }): Effect.fn.Return<void, PlatformError.PlatformError | Schema.SchemaError> {
    const { fileSystem, path, studentDir, student, suffix } = input;
    const studentFilePath = path.join(studentDir, "student.json");
    const tempPath = `${studentFilePath}.${process.pid}.${suffix}.tmp`;
    const encoded = yield* encodeStudentFileJson(student);

    yield* fileSystem.makeDirectory(studentDir, { recursive: true });
    yield* fileSystem.writeFileString(tempPath, `${encoded}\n`);
    yield* fileSystem.rename(tempPath, studentFilePath);
  },
);

/**
 * Soft-delete a student folder by moving it to .trash/<folderName>-<uuid>
 */
const softDeleteStudentFolder = Effect.fn("desktop.students.softDeleteStudentFolder")(
  function* (input: {
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly crypto: Crypto.Crypto;
    readonly studentsDir: string;
    readonly folderName: string;
  }): Effect.fn.Return<void> {
    const { fileSystem, path, crypto, studentsDir, folderName } = input;
    const sourcePath = path.join(studentsDir, folderName);
    const sourceExists = yield* fileSystem.exists(sourcePath).pipe(Effect.orElseSucceed(() => false));
    if (!sourceExists) {
      return;
    }

    const trashDir = path.join(studentsDir, ".trash");
    const suffix = yield* crypto.randomUUIDv4.pipe(
      Effect.map((uuid) => uuid.replace(/-/g, "").slice(0, 8)),
      Effect.orElseSucceed(() => `${process.pid}`),
    );
    const trashPath = path.join(trashDir, `${folderName}-${suffix}`);

    yield* fileSystem.makeDirectory(trashDir, { recursive: true }).pipe(Effect.ignore);
    yield* fileSystem.rename(sourcePath, trashPath).pipe(Effect.ignore);
  },
);

/**
 * One-time migration: convert old students.json to per-student files
 */
const migrateIfNeeded = Effect.fn("desktop.students.migrateIfNeeded")(
  function* (input: {
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly oldRegistryPath: string;
    readonly studentsDir: string;
    readonly crypto: Crypto.Crypto;
  }): Effect.fn.Return<void> {
    const { fileSystem, path, oldRegistryPath, studentsDir, crypto } = input;

    const migratedMarkerPath = path.join(studentsDir, ".migrated");
    const markerExists = yield* fileSystem.exists(migratedMarkerPath).pipe(Effect.orElseSucceed(() => false));
    if (markerExists) {
      return;
    }

    const oldFileExists = yield* fileSystem.exists(oldRegistryPath).pipe(Effect.orElseSucceed(() => false));
    if (!oldFileExists) {
      yield* fileSystem.makeDirectory(studentsDir, { recursive: true }).pipe(Effect.ignore);
      yield* fileSystem.writeFileString(migratedMarkerPath, "").pipe(Effect.ignore);
      return;
    }

    const existingStudents = yield* readStudentsFromDisk({
      fileSystem,
      path,
      studentsDir,
    });
    if (existingStudents.length > 0) {
      yield* fileSystem.writeFileString(migratedMarkerPath, "").pipe(Effect.ignore);
      return;
    }

    const raw = yield* fileSystem.readFileString(oldRegistryPath).pipe(Effect.option);
    if (Option.isNone(raw)) {
      yield* fileSystem.makeDirectory(studentsDir, { recursive: true }).pipe(Effect.ignore);
      yield* fileSystem.writeFileString(migratedMarkerPath, "").pipe(Effect.ignore);
      return;
    }

    const document = yield* decodeStudentRegistryDocumentJson(raw.value).pipe(
      Effect.orElseSucceed(() => ({ version: "1", students: [] })),
    );

    const students = document.students ?? [];
    for (const student of students) {
      const folderName = deriveStudentFolderName(student);
      const studentDir = path.join(studentsDir, folderName);
      const suffix = yield* crypto.randomUUIDv4.pipe(
        Effect.map((uuid) => uuid.replace(/-/g, "")),
        Effect.orElseSucceed(() => `${process.pid}-migration`),
      );
      yield* writeStudentFile({
        fileSystem,
        path,
        studentDir,
        student,
        suffix,
      }).pipe(Effect.ignore);
    }

    const bakPath = `${oldRegistryPath}.bak`;
    yield* fileSystem.rename(oldRegistryPath, bakPath).pipe(Effect.ignore);
    yield* fileSystem.writeFileString(migratedMarkerPath, "").pipe(Effect.ignore);
  },
);

export const layer = Layer.effect(
  DesktopStudents,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const oldRegistryPath = environment.studentRegistryPath;
    const studentsDir = path.join(environment.workspaceRoot, "students");

    yield* migrateIfNeeded({
      fileSystem,
      path,
      oldRegistryPath,
      studentsDir,
      crypto,
    });

    return DesktopStudents.of({
      getRegistry: readStudentsFromDisk({
        fileSystem,
        path,
        studentsDir,
      }).pipe(Effect.withSpan("desktop.students.getRegistry")),

      setRegistry: Effect.fn("desktop.students.setRegistry")(function* (students) {
        const currentStudents = yield* readStudentsFromDisk({
          fileSystem,
          path,
          studentsDir,
        });

        const currentById = new Map(currentStudents.map((s) => [s.id, s]));
        const incomingById = new Map(students.map((s) => [s.id, s]));

        const currentFolders = new Map(
          currentStudents.map((s) => [s.id, deriveStudentFolderName(s)]),
        );

        for (const student of students) {
          const current = currentById.get(student.id);
          const needsWrite = !current || !studentsEqual(current, student);

          if (needsWrite) {
            const folderName = deriveStudentFolderName(student);
            const studentDir = path.join(studentsDir, folderName);
            const suffix = yield* crypto.randomUUIDv4.pipe(
              Effect.map((uuid) => uuid.replace(/-/g, "")),
              Effect.orElseSucceed(() => `${process.pid}`),
            );

            yield* writeStudentFile({
              fileSystem,
              path,
              studentDir,
              student,
              suffix,
            }).pipe(Effect.mapError((cause) => new DesktopStudentsWriteError({ cause })));
          }
        }

        for (const currentStudent of currentStudents) {
          if (!incomingById.has(currentStudent.id)) {
            const folderName = currentFolders.get(currentStudent.id);
            if (folderName) {
              yield* softDeleteStudentFolder({
                fileSystem,
                path,
                crypto,
                studentsDir,
                folderName,
              }).pipe(Effect.ignore);
            }
          }
        }
      }),
    });
  }),
);

export const layerTest = Layer.unwrap(
  Effect.gen(function* () {
    const ref = yield* Ref.make<readonly Student[]>([]);

    return Layer.succeed(
      DesktopStudents,
      DesktopStudents.of({
        getRegistry: Ref.get(ref),
        setRegistry: (students) => Ref.set(ref, students),
      }),
    );
  }),
);
