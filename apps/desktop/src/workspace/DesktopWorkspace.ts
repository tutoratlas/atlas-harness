import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { bootstrapAtlasSkills } from "./bootstrapAtlasSkills.ts";

export class DesktopWorkspaceError extends Data.TaggedError("DesktopWorkspaceError")<{
  readonly cause: PlatformError.PlatformError;
  readonly context?: string;
}> {
  override get message() {
    const ctx = this.context ?? "workspace operation";
    return `Failed ${ctx}: ${this.cause.message}`;
  }
}

export interface DesktopWorkspaceShape {
  readonly ensureStudentWorkspace: (input: {
    readonly slug: string;
    readonly agentsMarkdown?: string;
  }) => Effect.Effect<{ readonly workspaceFolder: string }, DesktopWorkspaceError>;
  readonly deleteStudentWorkspace: (input: {
    readonly workspaceFolder: string;
  }) => Effect.Effect<void, DesktopWorkspaceError>;
}

export class DesktopWorkspace extends Context.Service<
  DesktopWorkspace,
  DesktopWorkspaceShape
>()("@t3tools/desktop/workspace/DesktopWorkspace") {}

const ensureStudentWorkspaceImpl = Effect.fnUntraced(function* (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly slug: string;
  readonly agentsMarkdown?: string;
}): Effect.fn.Return<{ readonly workspaceFolder: string }, PlatformError.PlatformError> {
  const studentsDir = input.path.join(input.workspaceRoot, "students");
  const folderPath = input.path.join(studentsDir, input.slug);
  const agentsMarkdownPath = input.path.join(folderPath, "AGENTS.md");

  // Create the student workspace folder (idempotent)
  yield* input.fileSystem.makeDirectory(folderPath, { recursive: true });

  // Seed AGENTS.md only if it doesn't exist (idempotent)
  const agentsMarkdownExists = yield* input.fileSystem
    .exists(agentsMarkdownPath)
    .pipe(Effect.orElseSucceed(() => false));

  if (!agentsMarkdownExists && input.agentsMarkdown !== undefined) {
    yield* input.fileSystem.writeFileString(agentsMarkdownPath, input.agentsMarkdown);
  }

  // Return relative path from workspace root
  const workspaceFolder = input.path.join("students", input.slug);
  return { workspaceFolder };
});

const deleteStudentWorkspaceImpl = Effect.fnUntraced(function* (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly workspaceFolder: string;
}): Effect.fn.Return<void, PlatformError.PlatformError> {
  // Resolve the full path
  const targetPath = input.path.join(input.workspaceRoot, input.workspaceFolder);

  // Resolve symlinks to get the real path
  const realPath = yield* input.fileSystem.realPath(targetPath);

  // Validate that the resolved path is strictly inside <workspaceRoot>/students/
  const studentsDir = input.path.join(input.workspaceRoot, "students");
  const realStudentsDir = yield* input.fileSystem.realPath(studentsDir);

  // Security check: ensure the real path starts with the students directory
  if (!realPath.startsWith(realStudentsDir + input.path.sep) && realPath !== realStudentsDir) {
    return yield* Effect.die(
      `Security: Path '${realPath}' is not strictly inside students directory '${realStudentsDir}'`,
    );
  }

  // Recursively remove the directory
  yield* input.fileSystem.remove(realPath, { recursive: true });
});

export const layer = Layer.effect(
  DesktopWorkspace,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Workspace root comes from environment (e.g., ~/tutoratlas)
    const workspaceRoot = environment.workspaceRoot;

    // Bootstrap Atlas skills directories on layer initialization
    yield* bootstrapAtlasSkills({ fileSystem, path, workspaceRoot });

    return DesktopWorkspace.of({
      ensureStudentWorkspace: (input) =>
        ensureStudentWorkspaceImpl({
          fileSystem,
          path,
          workspaceRoot,
          slug: input.slug,
          ...(input.agentsMarkdown !== undefined && { agentsMarkdown: input.agentsMarkdown }),
        }).pipe(
          Effect.mapError((cause) =>
            new DesktopWorkspaceError({ cause, context: "to ensure student workspace" }),
          ),
          Effect.withSpan("desktop.workspace.ensureStudentWorkspace"),
        ),
      deleteStudentWorkspace: (input) =>
        deleteStudentWorkspaceImpl({
          fileSystem,
          path,
          workspaceRoot,
          workspaceFolder: input.workspaceFolder,
        }).pipe(
          Effect.mapError((cause) =>
            new DesktopWorkspaceError({ cause, context: "to delete student workspace" }),
          ),
          Effect.withSpan("desktop.workspace.deleteStudentWorkspace"),
        ),
    });
  }),
);

export const layerTest = (workspaceRoot = "/tmp/test-workspace") =>
  Layer.effect(
    DesktopWorkspace,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspacesRef = yield* Ref.make(new Map<string, string>());

      return DesktopWorkspace.of({
        ensureStudentWorkspace: (input) =>
          Effect.gen(function* () {
            const studentsDir = path.join(workspaceRoot, "students");
            const folderPath = path.join(studentsDir, input.slug);
            const workspaceFolder = path.join("students", input.slug);

            // Store in ref for test assertions
            yield* Ref.update(workspacesRef, (map) => {
              const newMap = new Map(map);
              newMap.set(input.slug, folderPath);
              return newMap;
            });

            // In test mode, we can optionally still create the actual folder
            yield* fileSystem.makeDirectory(folderPath, { recursive: true });

            const agentsMarkdownPath = path.join(folderPath, "AGENTS.md");
            const agentsMarkdownExists = yield* fileSystem
              .exists(agentsMarkdownPath)
              .pipe(Effect.orElseSucceed(() => false));

            if (!agentsMarkdownExists && input.agentsMarkdown !== undefined) {
              yield* fileSystem.writeFileString(agentsMarkdownPath, input.agentsMarkdown);
            }

            return { workspaceFolder };
          }).pipe(
            Effect.mapError((cause) =>
              new DesktopWorkspaceError({ cause, context: "to ensure student workspace" }),
            ),
          ),
        deleteStudentWorkspace: (input) =>
          Effect.gen(function* () {
            const targetPath = path.join(workspaceRoot, input.workspaceFolder);
            const realPath = yield* fileSystem.realPath(targetPath);

            const studentsDir = path.join(workspaceRoot, "students");
            const realStudentsDir = yield* fileSystem.realPath(studentsDir);

            if (!realPath.startsWith(realStudentsDir + path.sep) && realPath !== realStudentsDir) {
              return yield* Effect.die(
                `Security: Path '${realPath}' is not strictly inside students directory '${realStudentsDir}'`,
              );
            }

            yield* fileSystem.remove(realPath, { recursive: true });

            // Remove from ref for test assertions
            yield* Ref.update(workspacesRef, (map) => {
              const newMap = new Map(map);
              // Find and remove by folder path
              for (const [slug, folder] of newMap.entries()) {
                if (folder === targetPath) {
                  newMap.delete(slug);
                  break;
                }
              }
              return newMap;
            });
          }).pipe(
            Effect.mapError((cause) =>
              new DesktopWorkspaceError({ cause, context: "to delete student workspace" }),
            ),
          ),
      });
    }),
  );
