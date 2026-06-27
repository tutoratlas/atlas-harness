import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { Student, StudentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopStudents from "./DesktopStudents.ts";

const testStudent: Student = {
  id: StudentId.make("student-1"),
  name: "John Doe",
  phone: {
    country: "SG",
    number: "98765432",
  },
  parents: [
    {
      name: "Jane Doe",
      relationship: "Mother",
      phone: {
        country: "SG",
        number: "91234567",
      },
    },
  ],
  subjects: ["Mathematics", "Physics"],
  school: "Springfield High",
  address: {
    block: "123",
    street: "Main Street",
    unit: "#01-234",
    postalCode: "123456",
  },
  notes: "Good student",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const StudentRegistryDocumentProbe = Schema.Struct({
  version: Schema.String,
  students: Schema.Array(Schema.Unknown),
});
const decodeStudentRegistryDocumentProbe = Schema.decodeEffect(
  Schema.fromJsonString(StudentRegistryDocumentProbe),
);

function makeLayer(baseDir: string) {
  const environmentLayer = DesktopEnvironment.layer({
    dirname: "/repo/apps/desktop/src",
    homeDirectory: baseDir,
    platform: "darwin",
    processArch: "x64",
    appVersion: "1.2.3",
    appPath: "/repo",
    isPackaged: true,
    resourcesPath: "/missing/resources",
    runningUnderArm64Translation: false,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({ TUTORATLAS_HOME: baseDir })),
    ),
  );

  return DesktopStudents.layer.pipe(
    Layer.provideMerge(environmentLayer),
    Layer.provideMerge(NodeServices.layer),
  );
}

const withStudents = <A, E, R>(
  effect: Effect.Effect<A, E, R | DesktopStudents.DesktopStudents>,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const baseDir = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "t3-desktop-students-test-",
    });
    return yield* effect.pipe(Effect.provide(makeLayer(baseDir)));
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped);

describe("DesktopStudents", () => {
  it.effect("persists and reloads student data", () =>
    withStudents(
      Effect.gen(function* () {
        const environment = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        const students = yield* DesktopStudents.DesktopStudents;
        yield* students.setRegistry([testStudent]);

        assert.deepEqual(yield* students.getRegistry, [testStudent]);
        const persisted = yield* decodeStudentRegistryDocumentProbe(
          yield* fileSystem.readFileString(environment.studentRegistryPath),
        );
        assert.equal(persisted.version, "1");
        assert.lengthOf(persisted.students, 1);
      }),
    ),
  );

  it.effect("treats missing file as empty array", () =>
    withStudents(
      Effect.gen(function* () {
        const students = yield* DesktopStudents.DesktopStudents;

        assert.deepEqual(yield* students.getRegistry, []);
      }),
    ),
  );

  it.effect("treats empty JSON document as empty array", () =>
    withStudents(
      Effect.gen(function* () {
        const environment = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        const students = yield* DesktopStudents.DesktopStudents;
        yield* fileSystem.makeDirectory(environment.stateDir, { recursive: true });
        yield* fileSystem.writeFileString(environment.studentRegistryPath, "{}\n");

        assert.deepEqual(yield* students.getRegistry, []);
      }),
    ),
  );

  it.effect("treats malformed JSON as empty array", () =>
    withStudents(
      Effect.gen(function* () {
        const environment = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        const students = yield* DesktopStudents.DesktopStudents;
        yield* fileSystem.makeDirectory(environment.stateDir, { recursive: true });
        yield* fileSystem.writeFileString(environment.studentRegistryPath, "{not-json");

        assert.deepEqual(yield* students.getRegistry, []);
      }),
    ),
  );

  it.effect("atomic write produces valid JSON on disk", () =>
    withStudents(
      Effect.gen(function* () {
        const environment = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        const students = yield* DesktopStudents.DesktopStudents;
        yield* students.setRegistry([testStudent]);

        const persisted = yield* decodeStudentRegistryDocumentProbe(
          yield* fileSystem.readFileString(environment.studentRegistryPath),
        );
        assert.equal(persisted.version, "1");
        assert.lengthOf(persisted.students, 1);
      }),
    ),
  );
});
