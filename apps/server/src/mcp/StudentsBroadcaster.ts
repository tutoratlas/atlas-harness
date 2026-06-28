import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as PubSub from "effect/PubSub";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type { PreviewAutomationUnavailableError, StudentsChangedEvent } from "@t3tools/contracts";

import * as McpInvocationContext from "./McpInvocationContext.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ProjectionRepositoryError } from "../persistence/Errors.ts";

export interface StudentsBroadcasterShape {
  readonly streamChanges: () => Stream.Stream<
    StudentsChangedEvent,
    PlatformError.PlatformError | PreviewAutomationUnavailableError | ProjectionRepositoryError,
    McpInvocationContext.McpInvocationContext | ProjectionSnapshotQuery
  >;
}

export class StudentsBroadcaster extends Context.Service<
  StudentsBroadcaster,
  StudentsBroadcasterShape
>()("t3/mcp/StudentsBroadcaster") {}

export const layer = Layer.effect(
  StudentsBroadcaster,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const changesPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<StudentsChangedEvent>(),
      (pubsub) => PubSub.shutdown(pubsub),
    );
    const broadcasterScope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
      Scope.close(scope, Exit.void),
    );

    const streamChanges: StudentsBroadcasterShape["streamChanges"] = () =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Get workspace root from MCP invocation context
          const scope = yield* McpInvocationContext.requireMcpCapability("students");
          const snapshotQuery = yield* ProjectionSnapshotQuery;
          const contextOption = yield* snapshotQuery.getThreadCheckpointContext(scope.threadId);

          if (Option.isNone(contextOption)) {
            // If no context, return empty stream
            return Stream.empty;
          }

          const workspaceRoot = contextOption.value.workspaceRoot;
          const studentsDir = path.join(workspaceRoot, "students");

          // Check if students directory exists
          const studentsExists = yield* fs.exists(studentsDir);
          if (!studentsExists) {
            // If directory doesn't exist, return empty stream
            return Stream.empty;
          }

          // Watch the students directory using fs.watch() + Stream.filter + Stream.debounce
          const studentChanges = fs.watch(studentsDir).pipe(
            Stream.filter((event) => {
              // Filter for student.json files
              return event.path.includes("student.json");
            }),
            Stream.debounce(Duration.millis(100)),
            Stream.map(() => ({ tag: "studentsChanged" as const })),
            Stream.tap((event) => PubSub.publish(changesPubSub, event)),
          );

          // Also subscribe to the pubsub for changes published elsewhere
          const pubsubStream = Stream.fromPubSub(changesPubSub);

          // Merge both streams
          return Stream.merge(studentChanges, pubsubStream);
        }),
      );

    return {
      streamChanges,
    } satisfies StudentsBroadcasterShape;
  }),
);
