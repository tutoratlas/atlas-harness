import { Student, StudentId, StudentRegistryDocument, CountryCode } from "@t3tools/contracts";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
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
  number: Schema.String,
});

const SingaporeAddressSchema = Schema.Struct({
  block: Schema.optionalKey(Schema.String),
  street: Schema.optionalKey(Schema.String),
  building: Schema.optionalKey(Schema.String),
  unit: Schema.optionalKey(Schema.String),
  postalCode: Schema.optionalKey(Schema.String),
});

const ParentSchema = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  relationship: Schema.optionalKey(Schema.String),
  phone: Schema.optionalKey(PhoneNumberSchema),
});

const StudentSchema = Schema.Struct({
  id: StudentId,
  name: Schema.String,
  phone: Schema.optionalKey(PhoneNumberSchema),
  parents: Schema.optionalKey(Schema.Array(ParentSchema)),
  subjects: Schema.optionalKey(Schema.Array(Schema.String)),
  school: Schema.optionalKey(Schema.String),
  address: Schema.optionalKey(SingaporeAddressSchema),
  notes: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const StudentRegistryDocumentSchema = Schema.Struct({
  version: Schema.optionalKey(Schema.String),
  students: Schema.optionalKey(Schema.Array(StudentSchema)),
});

const StudentRegistryDocumentJson = fromLenientJson(StudentRegistryDocumentSchema);
const decodeStudentRegistryDocumentJson = Schema.decodeEffect(StudentRegistryDocumentJson);
const encodeStudentRegistryDocumentJson = Schema.encodeEffect(StudentRegistryDocumentJson);

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

function normalizeStudentRegistryDocument(
  document: StudentRegistryStorageDocument,
): StudentRegistryDocument {
  return {
    version: document.version ?? "1",
    students: document.students ?? [],
  };
}

function readRegistryDocument(
  fileSystem: FileSystem.FileSystem,
  registryPath: string,
): Effect.Effect<StudentRegistryDocument> {
  return fileSystem.readFileString(registryPath).pipe(
    Effect.option,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed({ version: "1", students: [] }),
        onSome: (raw) =>
          decodeStudentRegistryDocumentJson(raw).pipe(
            Effect.map(normalizeStudentRegistryDocument),
            Effect.orElseSucceed(() => ({ version: "1", students: [] })),
          ),
      }),
    ),
  );
}

const writeRegistryDocument = Effect.fn("desktop.students.writeRegistryDocument")(
  function* (input: {
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly registryPath: string;
    readonly document: StudentRegistryDocument;
    readonly suffix: string;
  }): Effect.fn.Return<void, PlatformError.PlatformError | Schema.SchemaError> {
    const directory = input.path.dirname(input.registryPath);
    const tempPath = `${input.registryPath}.${process.pid}.${input.suffix}.tmp`;
    const encoded = yield* encodeStudentRegistryDocumentJson(input.document);
    yield* input.fileSystem.makeDirectory(directory, { recursive: true });
    yield* input.fileSystem.writeFileString(tempPath, `${encoded}\n`);
    yield* input.fileSystem.rename(tempPath, input.registryPath);
  },
);

export const layer = Layer.effect(
  DesktopStudents,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const registryPath = environment.studentRegistryPath;

    const writeDocument = (document: StudentRegistryDocument) =>
      crypto.randomUUIDv4.pipe(
        Effect.map((uuid) => uuid.replace(/-/g, "")),
        Effect.flatMap((suffix) =>
          writeRegistryDocument({
            fileSystem,
            path,
            registryPath,
            document,
            suffix,
          }),
        ),
        Effect.mapError((cause) => new DesktopStudentsWriteError({ cause })),
      );

    return DesktopStudents.of({
      getRegistry: readRegistryDocument(fileSystem, registryPath).pipe(
        Effect.map((document) => document.students),
        Effect.withSpan("desktop.students.getRegistry"),
      ),
      setRegistry: Effect.fn("desktop.students.setRegistry")(function* (students) {
        const document: StudentRegistryDocument = {
          version: "1",
          students,
        };
        yield* writeDocument(document);
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
