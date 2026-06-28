import {
  StudentsConfirmRejectedError,
  StudentsConfirmTimeoutError,
  StudentsConfirmUnavailableError,
  type StudentsConfirmError,
  type StudentsConfirmRequest,
  type StudentsConfirmResponse,
  type StudentConfirmOperation,
  type StudentSummary,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as McpInvocationContext from "./McpInvocationContext.ts";

export interface StudentsConfirmInvokeInput {
  readonly scope: McpInvocationContext.McpInvocationScope;
  readonly operation: StudentConfirmOperation;
  readonly studentSummary: StudentSummary;
}

export interface StudentsConfirmBrokerShape {
  readonly connect: (clientId: string) => Effect.Effect<Stream.Stream<StudentsConfirmRequest>>;
  readonly respond: (
    response: StudentsConfirmResponse,
  ) => Effect.Effect<void, StudentsConfirmError>;
  readonly invoke: (request: StudentsConfirmInvokeInput) => Effect.Effect<boolean, StudentsConfirmError>;
}

export class StudentsConfirmBroker extends Context.Service<
  StudentsConfirmBroker,
  StudentsConfirmBrokerShape
>()("t3/mcp/StudentsConfirmBroker") {}

interface ClientConnection {
  readonly clientId: string;
  readonly queue: Queue.Queue<StudentsConfirmRequest>;
}

interface PendingRequest {
  readonly clientId: string;
  readonly deferred: Deferred.Deferred<boolean, StudentsConfirmError>;
}

interface BrokerState {
  readonly clients: ReadonlyMap<string, ClientConnection>;
  readonly pending: ReadonlyMap<string, PendingRequest>;
  readonly requestSequence: number;
}

const make = Effect.gen(function* StudentsConfirmBrokerMake() {
  const state = yield* SynchronizedRef.make<BrokerState>({
    clients: new Map(),
    pending: new Map(),
    requestSequence: 0,
  });

  const disconnect = Effect.fn("StudentsConfirmBroker.disconnect")(function* (
    clientId: string,
    queue: ClientConnection["queue"],
  ) {
    const toFail = yield* SynchronizedRef.modify(state, (current) => {
      if (current.clients.get(clientId)?.queue !== queue) {
        return [[] as ReadonlyArray<PendingRequest>, current] as const;
      }
      const clients = new Map(current.clients);
      const pending = new Map(current.pending);
      const disconnected: PendingRequest[] = [];
      clients.delete(clientId);
      for (const [requestId, entry] of pending) {
        if (entry.clientId === clientId) {
          pending.delete(requestId);
          disconnected.push(entry);
        }
      }
      return [disconnected, { ...current, clients, pending }] as const;
    });
    yield* Effect.forEach(
      toFail,
      ({ deferred }) =>
        Deferred.fail(
          deferred,
          new StudentsConfirmUnavailableError({
            message: "The confirmation client disconnected.",
          }),
        ),
      { discard: true },
    );
    yield* Queue.shutdown(queue);
  });

  const connect: StudentsConfirmBrokerShape["connect"] = Effect.fn(
    "StudentsConfirmBroker.connect",
  )(function* (clientId) {
    const queue = yield* Queue.unbounded<StudentsConfirmRequest>();
    const previous = yield* SynchronizedRef.modify(state, (current) => {
      const clients = new Map(current.clients);
      clients.set(clientId, { clientId, queue });
      return [current.clients.get(clientId), { ...current, clients }] as const;
    });
    if (previous) yield* disconnect(clientId, previous.queue);
    return Stream.fromQueue(queue).pipe(Stream.ensuring(disconnect(clientId, queue)));
  });

  const respond: StudentsConfirmBrokerShape["respond"] = Effect.fn(
    "StudentsConfirmBroker.respond",
  )(function* (response) {
    const pending = yield* SynchronizedRef.modify(state, (current) => {
      const entry = current.pending.get(response.requestId);
      if (!entry) return [undefined, current] as const;
      const next = new Map(current.pending);
      next.delete(response.requestId);
      return [entry, { ...current, pending: next }] as const;
    });
    if (!pending) return;
    if (response.confirmed) {
      yield* Deferred.succeed(pending.deferred, true);
    } else {
      yield* Deferred.fail(
        pending.deferred,
        new StudentsConfirmRejectedError({
          message: "User rejected the confirmation request.",
        }),
      );
    }
  });

  const invoke = Effect.fn("StudentsConfirmBroker.invoke")(function* (
    input: Parameters<StudentsConfirmBrokerShape["invoke"]>[0],
  ): Effect.fn.Return<boolean, StudentsConfirmError> {
    const current = yield* SynchronizedRef.get(state);

    // Find a connected client. For students, we don't need owner/focus tracking -
    // any connected desktop client can handle the confirmation.
    const clientId = Array.from(current.clients.keys())[0];
    if (!clientId) {
      return yield* new StudentsConfirmUnavailableError({
        message: "No desktop client is available for confirmation.",
      });
    }

    const connection = current.clients.get(clientId);
    if (!connection) {
      return yield* new StudentsConfirmUnavailableError({
        message: "The confirmation client is not connected.",
      });
    }

    const timeoutMs = 30_000; // Always 30 seconds, not bypassable
    const deferred = yield* Deferred.make<boolean, StudentsConfirmError>();
    const requestId = yield* SynchronizedRef.modify(state, (next) => {
      const requestId = `students-confirm-${next.requestSequence}`;
      const pending = new Map(next.pending);
      pending.set(requestId, { clientId, deferred });
      return [requestId, { ...next, pending, requestSequence: next.requestSequence + 1 }] as const;
    });

    const removePending = SynchronizedRef.update(state, (next) => {
      if (!next.pending.has(requestId)) return next;
      const pending = new Map(next.pending);
      pending.delete(requestId);
      return { ...next, pending };
    });

    const awaitResponse = Effect.fn("StudentsConfirmBroker.awaitResponse")(function* () {
      const offered = yield* Queue.offer(connection.queue, {
        requestId,
        operation: input.operation,
        student: input.studentSummary,
      });
      if (!offered) {
        return yield* new StudentsConfirmUnavailableError({
          message: "The confirmation client is no longer accepting requests.",
        });
      }
      const result = yield* Deferred.await(deferred).pipe(Effect.timeoutOption(timeoutMs));
      return yield* Option.match(result, {
        onNone: () =>
          Effect.fail(
            new StudentsConfirmTimeoutError({
              message: `Confirmation request timed out after ${timeoutMs}ms.`,
            }),
          ),
        onSome: (value) => Effect.succeed(value),
      });
    });

    return yield* awaitResponse().pipe(Effect.ensuring(removePending));
  });

  return StudentsConfirmBroker.of({ connect, respond, invoke });
}).pipe(Effect.withSpan("StudentsConfirmBroker.make"));

export const layer = Layer.effect(StudentsConfirmBroker, make);

/** Exposed for tests. */
export const __testing = {
  make,
};
