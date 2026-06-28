import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { Student, StudentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { StudentToolkitHandlersLive } from "./handlers.ts";
import { StudentToolkit } from "./tools.ts";

function makeMockLayer(workspaceRoot: string) {
  return Layer.mergeAll(
    Layer.mock(McpInvocationContext.McpInvocationContext)({
      maybeCapability: () => Effect.succeed(Option.some("students" as const)),
      requireCapability: () =>
        Effect.succeed({
          threadId: "test-thread-123" as const,
          capability: "students" as const,
        }),
    }),
    Layer.mock(ProjectionSnapshotQuery)({
      getThreadCheckpointContext: () =>
        Effect.succeed(
          Option.some({
            workspaceRoot,
            checkpointId: "test-checkpoint" as const,
          }),
        ),
    }),
  );
}

function makeTestLayer(workspaceRoot: string) {
  return StudentToolkitHandlersLive.pipe(Layer.provide(makeMockLayer(workspaceRoot)));
}

describe("StudentToolkit handlers", () => {
  describe("list_students", () => {
    it.effect("returns empty array when students directory does not exist", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.list_students();
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.deepStrictEqual(result, []);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns array of valid students, skipping invalid records", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const studentsDir = path.join(workspaceRoot, "students");
        yield* fs.makeDirectory(studentsDir, { recursive: true });

        // Create valid student
        const validStudentDir = path.join(studentsDir, "john-doe");
        yield* fs.makeDirectory(validStudentDir, { recursive: true });
        const validStudent = {
          id: "valid-123",
          name: "John Doe",
          workspaceFolder: "students/john-doe",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        };
        yield* fs.writeFileString(
          path.join(validStudentDir, "student.json"),
          JSON.stringify(validStudent) + "\n",
        );

        // Create invalid student (missing required fields)
        const invalidStudentDir = path.join(studentsDir, "invalid");
        yield* fs.makeDirectory(invalidStudentDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(invalidStudentDir, "student.json"),
          JSON.stringify({ id: "invalid-123" }) + "\n",
        );

        // Create directory without student.json
        const emptyDir = path.join(studentsDir, "empty");
        yield* fs.makeDirectory(emptyDir, { recursive: true });

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.list_students();
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].id, "valid-123");
        assert.strictEqual(result[0].name, "John Doe");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  describe("find_students", () => {
    it.effect("filters by name (partial match, case-insensitive)", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const studentsDir = path.join(workspaceRoot, "students");
        yield* fs.makeDirectory(studentsDir, { recursive: true });

        // Create students
        const students = [
          { id: "1", name: "John Doe", slug: "john-doe" },
          { id: "2", name: "Jane Smith", slug: "jane-smith" },
          { id: "3", name: "Johnny Walker", slug: "johnny-walker" },
        ];

        for (const student of students) {
          const studentDir = path.join(studentsDir, student.slug);
          yield* fs.makeDirectory(studentDir, { recursive: true });
          yield* fs.writeFileString(
            path.join(studentDir, "student.json"),
            JSON.stringify({
              ...student,
              workspaceFolder: `students/${student.slug}`,
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            }) + "\n",
          );
        }

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.find_students({ name: "john" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.length, 2);
        const names = result.map((s: Student) => s.name).sort();
        assert.deepStrictEqual(names, ["John Doe", "Johnny Walker"]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("filters by school (exact match)", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const studentsDir = path.join(workspaceRoot, "students");
        yield* fs.makeDirectory(studentsDir, { recursive: true });

        const students = [
          { id: "1", name: "John Doe", school: "MIT", slug: "john-doe" },
          { id: "2", name: "Jane Smith", school: "Harvard", slug: "jane-smith" },
          { id: "3", name: "Johnny Walker", school: "MIT", slug: "johnny-walker" },
        ];

        for (const student of students) {
          const studentDir = path.join(studentsDir, student.slug);
          yield* fs.makeDirectory(studentDir, { recursive: true });
          yield* fs.writeFileString(
            path.join(studentDir, "student.json"),
            JSON.stringify({
              ...student,
              workspaceFolder: `students/${student.slug}`,
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            }) + "\n",
          );
        }

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.find_students({ school: "MIT" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.length, 2);
        const names = result.map((s: Student) => s.name).sort();
        assert.deepStrictEqual(names, ["John Doe", "Johnny Walker"]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("filters by subject (array contains, case-insensitive)", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const studentsDir = path.join(workspaceRoot, "students");
        yield* fs.makeDirectory(studentsDir, { recursive: true });

        const students = [
          {
            id: "1",
            name: "John Doe",
            subjects: ["Math", "Physics"],
            slug: "john-doe",
          },
          {
            id: "2",
            name: "Jane Smith",
            subjects: ["Chemistry", "Biology"],
            slug: "jane-smith",
          },
          {
            id: "3",
            name: "Johnny Walker",
            subjects: ["Mathematics", "Computer Science"],
            slug: "johnny-walker",
          },
        ];

        for (const student of students) {
          const studentDir = path.join(studentsDir, student.slug);
          yield* fs.makeDirectory(studentDir, { recursive: true });
          yield* fs.writeFileString(
            path.join(studentDir, "student.json"),
            JSON.stringify({
              ...student,
              workspaceFolder: `students/${student.slug}`,
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            }) + "\n",
          );
        }

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.find_students({ subject: "math" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.length, 2);
        const names = result.map((s: Student) => s.name).sort();
        assert.deepStrictEqual(names, ["John Doe", "Johnny Walker"]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("combines filters with AND logic", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const studentsDir = path.join(workspaceRoot, "students");
        yield* fs.makeDirectory(studentsDir, { recursive: true });

        const students = [
          {
            id: "1",
            name: "John Doe",
            school: "MIT",
            subjects: ["Math"],
            slug: "john-doe",
          },
          {
            id: "2",
            name: "Jane Smith",
            school: "MIT",
            subjects: ["Chemistry"],
            slug: "jane-smith",
          },
          {
            id: "3",
            name: "Johnny Walker",
            school: "Harvard",
            subjects: ["Math"],
            slug: "johnny-walker",
          },
        ];

        for (const student of students) {
          const studentDir = path.join(studentsDir, student.slug);
          yield* fs.makeDirectory(studentDir, { recursive: true });
          yield* fs.writeFileString(
            path.join(studentDir, "student.json"),
            JSON.stringify({
              ...student,
              workspaceFolder: `students/${student.slug}`,
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            }) + "\n",
          );
        }

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.find_students({ school: "MIT", subject: "math" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, "John Doe");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  describe("get_student", () => {
    it.effect("gets student by id", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const studentsDir = path.join(workspaceRoot, "students");
        const studentDir = path.join(studentsDir, "john-doe");
        yield* fs.makeDirectory(studentDir, { recursive: true });

        const student = {
          id: "test-123",
          name: "John Doe",
          workspaceFolder: "students/john-doe",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        };
        yield* fs.writeFileString(
          path.join(studentDir, "student.json"),
          JSON.stringify(student) + "\n",
        );

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.get_student({ id: "test-123" as StudentId });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.id, "test-123");
        assert.strictEqual(result.name, "John Doe");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("gets student by slug (direct lookup)", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const studentsDir = path.join(workspaceRoot, "students");
        const studentDir = path.join(studentsDir, "john-doe");
        yield* fs.makeDirectory(studentDir, { recursive: true });

        const student = {
          id: "test-123",
          name: "John Doe",
          workspaceFolder: "students/john-doe",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        };
        yield* fs.writeFileString(
          path.join(studentDir, "student.json"),
          JSON.stringify(student) + "\n",
        );

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.get_student({ slug: "john-doe" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.id, "test-123");
        assert.strictEqual(result.name, "John Doe");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns error when student not found", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const error = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.get_student({ id: "nonexistent" as StudentId });
        }).pipe(Effect.flip, Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(error._tag, "StudentToolError");
        assert.match(error.message, /Student not found/);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  describe("create_student", () => {
    it.effect("creates student with minimal required fields", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.create_student({ name: "John Doe" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.name, "John Doe");
        assert.strictEqual(typeof result.id, "string");
        assert.strictEqual(result.workspaceFolder, "students/john-doe");
        assert.strictEqual(typeof result.createdAt, "string");
        assert.strictEqual(typeof result.updatedAt, "string");

        // Verify file was written
        const studentJsonPath = path.join(
          workspaceRoot,
          "students",
          "john-doe",
          "student.json",
        );
        const exists = yield* fs.exists(studentJsonPath);
        assert.strictEqual(exists, true);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("creates student with all optional fields", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.create_student({
            name: "Jane Smith",
            phone: "+6591234567",
            subjects: ["Math", "Physics"],
            school: "MIT",
            notes: "Test notes",
          });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.name, "Jane Smith");
        assert.strictEqual(result.phone, "+6591234567");
        assert.deepStrictEqual(result.subjects, ["Math", "Physics"]);
        assert.strictEqual(result.school, "MIT");
        assert.strictEqual(result.notes, "Test notes");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("disambiguates slug on collision", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        // Create first student
        const first = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.create_student({ name: "John Doe" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(first.workspaceFolder, "students/john-doe");

        // Create second student with same name
        const second = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.create_student({ name: "John Doe" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.notStrictEqual(second.workspaceFolder, "students/john-doe");
        assert.match(second.workspaceFolder, /^students\/john-doe-[0-9a-f]{6}$/);

        // Verify both directories exist
        const firstDir = path.join(workspaceRoot, "students", "john-doe");
        const secondSlug = second.workspaceFolder.replace(/^students\//, "");
        const secondDir = path.join(workspaceRoot, "students", secondSlug);

        const firstExists = yield* fs.exists(firstDir);
        const secondExists = yield* fs.exists(secondDir);
        assert.strictEqual(firstExists, true);
        assert.strictEqual(secondExists, true);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("sets custom workspaceFolder if provided", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.create_student({
            name: "John Doe",
            workspaceFolder: "custom/path",
          });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.workspaceFolder, "custom/path");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  describe("update_student", () => {
    it.effect("updates student with partial changes", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        // Create student
        const created = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.create_student({
            name: "John Doe",
            school: "MIT",
            subjects: ["Math"],
          });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        // Update student
        const updated = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.update_student({
            id: created.id,
            school: "Harvard",
            subjects: ["Physics", "Chemistry"],
          });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(updated.id, created.id);
        assert.strictEqual(updated.name, "John Doe"); // unchanged
        assert.strictEqual(updated.school, "Harvard"); // changed
        assert.deepStrictEqual(updated.subjects, ["Physics", "Chemistry"]); // changed
        assert.notStrictEqual(updated.updatedAt, created.updatedAt);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns error when student not found", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const error = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.update_student({
            id: "nonexistent" as StudentId,
            name: "New Name",
          });
        }).pipe(Effect.flip, Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(error._tag, "StudentToolError");
        assert.match(error.message, /Student not found/);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  describe("delete_student", () => {
    it.effect("deletes student by id and moves to trash", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        // Create student
        const created = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.create_student({ name: "John Doe" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        // Delete student
        yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.delete_student({ id: created.id });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        // Verify student directory no longer exists
        const studentDir = path.join(workspaceRoot, "students", "john-doe");
        const exists = yield* fs.exists(studentDir);
        assert.strictEqual(exists, false);

        // Verify .trash directory was created
        const trashDir = path.join(workspaceRoot, ".trash");
        const trashExists = yield* fs.exists(trashDir);
        assert.strictEqual(trashExists, true);

        // Verify student folder exists in trash with timestamp
        const trashEntries = yield* fs.readDirectory(trashDir);
        const trashEntry = trashEntries.find((entry: string) =>
          entry.startsWith("john-doe-"),
        );
        assert.strictEqual(typeof trashEntry, "string");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("deletes student by slug", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        // Create student
        yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.create_student({ name: "John Doe" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        // Delete student by slug
        yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.delete_student({ slug: "john-doe" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        // Verify student directory no longer exists
        const studentDir = path.join(workspaceRoot, "students", "john-doe");
        const exists = yield* fs.exists(studentDir);
        assert.strictEqual(exists, false);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns error when student not found", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const error = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.delete_student({ id: "nonexistent" as StudentId });
        }).pipe(Effect.flip, Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(error._tag, "StudentToolError");
        assert.match(error.message, /Student not found/);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  describe("edge cases", () => {
    it.effect("handles empty workspace directory gracefully", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        // Don't create students directory, just query
        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.list_students();
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.deepStrictEqual(result, []);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("handles missing students directory in find", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.find_students({ name: "John" });
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.deepStrictEqual(result, []);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("skips malformed JSON files during list", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "t3-student-test-",
        });

        const studentsDir = path.join(workspaceRoot, "students");
        yield* fs.makeDirectory(studentsDir, { recursive: true });

        // Create student with malformed JSON
        const malformedDir = path.join(studentsDir, "malformed");
        yield* fs.makeDirectory(malformedDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(malformedDir, "student.json"),
          "{ invalid json }",
        );

        // Create valid student
        const validDir = path.join(studentsDir, "valid");
        yield* fs.makeDirectory(validDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(validDir, "student.json"),
          JSON.stringify({
            id: "valid-123",
            name: "Valid Student",
            workspaceFolder: "students/valid",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          }) + "\n",
        );

        const result = yield* Effect.gen(function* () {
          const toolkit = yield* StudentToolkit;
          return yield* toolkit.list_students();
        }).pipe(Effect.provide(makeTestLayer(workspaceRoot)));

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].id, "valid-123");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });
});
