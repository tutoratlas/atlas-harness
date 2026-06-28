import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { Student, StudentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
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

  describe("Migration", () => {
    it.effect("converts old students.json to per-student files", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const baseDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3-desktop-students-migration-test-",
        });
        const path = yield* Path.Path;

        const stateDir = path.join(baseDir, "userdata");
        const oldRegistryPath = path.join(stateDir, "students.json");
        const studentsDir = path.join(baseDir, "tutoratlas", "students");

        yield* fileSystem.makeDirectory(stateDir, { recursive: true });
        yield* fileSystem.writeFileString(
          oldRegistryPath,
          JSON.stringify({
            version: "1",
            students: [testStudent],
          }),
        );

        yield* Effect.gen(function* () {
          const students = yield* DesktopStudents.DesktopStudents;
          const loaded = yield* students.getRegistry;

          assert.lengthOf(loaded, 1);
          assert.equal(loaded[0]?.id, testStudent.id);
          assert.equal(loaded[0]?.name, testStudent.name);

          const bakPath = `${oldRegistryPath}.bak`;
          const bakExists = yield* fileSystem.exists(bakPath);
          assert.equal(bakExists, true);

          const migratedMarkerPath = path.join(studentsDir, ".migrated");
          const markerExists = yield* fileSystem.exists(migratedMarkerPath);
          assert.equal(markerExists, true);
        }).pipe(Effect.provide(makeLayer(baseDir)));
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
    );

    it.effect("is idempotent - migrating again with same old file does not duplicate", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const baseDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3-desktop-students-migration-idempotent-test-",
        });
        const path = yield* Path.Path;

        const stateDir = path.join(baseDir, "userdata");
        const oldRegistryPath = path.join(stateDir, "students.json");
        const studentsDir = path.join(baseDir, "tutoratlas", "students");

        yield* fileSystem.makeDirectory(stateDir, { recursive: true });
        yield* fileSystem.writeFileString(
          oldRegistryPath,
          JSON.stringify({
            version: "1",
            students: [testStudent],
          }),
        );

        yield* Effect.gen(function* () {
          const students1 = yield* DesktopStudents.DesktopStudents;
          const loaded1 = yield* students1.getRegistry;
          assert.lengthOf(loaded1, 1);
        }).pipe(Effect.provide(makeLayer(baseDir)));

        const bakPath = `${oldRegistryPath}.bak`;
        yield* fileSystem.rename(bakPath, oldRegistryPath);

        const migratedMarkerPath = path.join(studentsDir, ".migrated");
        yield* fileSystem.remove(migratedMarkerPath);

        yield* Effect.gen(function* () {
          const students2 = yield* DesktopStudents.DesktopStudents;
          const loaded2 = yield* students2.getRegistry;

          assert.lengthOf(loaded2, 1);
          assert.equal(loaded2[0]?.id, testStudent.id);
        }).pipe(Effect.provide(makeLayer(baseDir)));
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
    );

    it.effect("preserves .bak file after migration", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const baseDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3-desktop-students-migration-bak-test-",
        });
        const path = yield* Path.Path;

        const stateDir = path.join(baseDir, "userdata");
        const oldRegistryPath = path.join(stateDir, "students.json");

        yield* fileSystem.makeDirectory(stateDir, { recursive: true });
        const originalContent = JSON.stringify({
          version: "1",
          students: [testStudent],
        });
        yield* fileSystem.writeFileString(oldRegistryPath, originalContent);

        yield* Effect.gen(function* () {
          yield* DesktopStudents.DesktopStudents;

          const bakPath = `${oldRegistryPath}.bak`;
          const bakExists = yield* fileSystem.exists(bakPath);
          assert.equal(bakExists, true);

          const bakContent = yield* fileSystem.readFileString(bakPath);
          assert.equal(bakContent, originalContent);

          const originalExists = yield* fileSystem.exists(oldRegistryPath);
          assert.equal(originalExists, false);
        }).pipe(Effect.provide(makeLayer(baseDir)));
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
    );

    it.effect("skips migration when .migrated marker exists", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const baseDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3-desktop-students-migration-skip-test-",
        });
        const path = yield* Path.Path;

        const stateDir = path.join(baseDir, "userdata");
        const oldRegistryPath = path.join(stateDir, "students.json");
        const studentsDir = path.join(baseDir, "tutoratlas", "students");
        const migratedMarkerPath = path.join(studentsDir, ".migrated");

        yield* fileSystem.makeDirectory(studentsDir, { recursive: true });
        yield* fileSystem.writeFileString(migratedMarkerPath, "");

        yield* fileSystem.makeDirectory(stateDir, { recursive: true });
        yield* fileSystem.writeFileString(
          oldRegistryPath,
          JSON.stringify({
            version: "1",
            students: [testStudent],
          }),
        );

        yield* Effect.gen(function* () {
          yield* DesktopStudents.DesktopStudents;

          const bakPath = `${oldRegistryPath}.bak`;
          const bakExists = yield* fileSystem.exists(bakPath);
          assert.equal(bakExists, false);
        }).pipe(Effect.provide(makeLayer(baseDir)));
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
    );

    it.effect("skips migration when per-student files already exist", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const baseDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3-desktop-students-migration-skip-existing-test-",
        });
        const path = yield* Path.Path;

        const stateDir = path.join(baseDir, "userdata");
        const oldRegistryPath = path.join(stateDir, "students.json");
        const studentsDir = path.join(baseDir, "tutoratlas", "students");
        const studentDir = path.join(studentsDir, "john-doe-dent-1");

        yield* fileSystem.makeDirectory(studentDir, { recursive: true });
        yield* fileSystem.writeFileString(
          path.join(studentDir, "student.json"),
          JSON.stringify(testStudent),
        );

        yield* fileSystem.makeDirectory(stateDir, { recursive: true });
        yield* fileSystem.writeFileString(
          oldRegistryPath,
          JSON.stringify({
            version: "1",
            students: [{ ...testStudent, id: "different-student" }],
          }),
        );

        yield* Effect.gen(function* () {
          yield* DesktopStudents.DesktopStudents;

          const bakPath = `${oldRegistryPath}.bak`;
          const bakExists = yield* fileSystem.exists(bakPath);
          assert.equal(bakExists, false);
        }).pipe(Effect.provide(makeLayer(baseDir)));
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
    );
  });
});
