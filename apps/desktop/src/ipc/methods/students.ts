import { Student } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopStudents from "../../settings/DesktopStudents.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const getStudents = makeIpcMethod({
  channel: IpcChannels.GET_STUDENTS_CHANNEL,
  payload: Schema.Void,
  result: Schema.Array(Student),
  handler: Effect.fn("desktop.ipc.students.getRegistry")(function* () {
    const students = yield* DesktopStudents.DesktopStudents;
    return yield* students.getRegistry;
  }),
});

export const setStudents = makeIpcMethod({
  channel: IpcChannels.SET_STUDENTS_CHANNEL,
  payload: Schema.Array(Student),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.students.setRegistry")(function* (studentsArray) {
    const students = yield* DesktopStudents.DesktopStudents;
    yield* students.setRegistry(studentsArray);
  }),
});
