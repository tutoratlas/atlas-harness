import { expect, it } from "@effect/vitest";
import { Tool } from "effect/unstable/ai";

import { StudentToolkit } from "./tools.ts";

it("exports provider-compatible object schemas", () => {
  for (const tool of Object.values(StudentToolkit.tools)) {
    const schema = Tool.getJsonSchema(tool) as {
      readonly type?: unknown;
      readonly properties?: Readonly<Record<string, unknown>>;
      readonly anyOf?: unknown;
      readonly oneOf?: unknown;
    };
    expect(
      tool.description?.length ?? 0,
      `${tool.name} should have a useful description`,
    ).toBeGreaterThan(40);
    // Schema must be either an object or a union (anyOf/oneOf)
    const hasValidSchema =
      schema.type === "object" || schema.anyOf !== undefined || schema.oneOf !== undefined;
    expect(hasValidSchema, `${tool.name} must export a valid schema`).toBe(true);
  }
});
