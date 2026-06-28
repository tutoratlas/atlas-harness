import * as Layer from "effect/Layer";
import { McpServer } from "effect/unstable/ai";

import { StudentToolkitHandlersLive } from "./handlers.ts";
import { StudentToolkit } from "./tools.ts";

export { StudentToolkit } from "./tools.ts";
export { StudentToolkitHandlersLive } from "./handlers.ts";

export const StudentToolkitRegistrationLive = McpServer.toolkit(StudentToolkit).pipe(
  Layer.provide(StudentToolkitHandlersLive),
);
