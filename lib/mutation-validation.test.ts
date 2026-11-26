import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseMutationInput,
  validationFailure,
} from "@/lib/mutation-validation";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("validationFailure", () => {
  it("returns a non-retryable validation failure for the scope", () => {
    expect(validationFailure(scope, "Name is required.")).toEqual({
      ok: false,
      status: "error",
      error: {
        code: "validation-failed",
        message: "Name is required.",
        retryable: false,
      },
      scope,
    });
  });
});

describe("parseMutationInput", () => {
  const schema = z.object({
    name: z.string().trim().min(1, "Enter a name."),
    size: z.coerce.number().int().min(1, "Size must be at least 1 GiB."),
  });

  it("returns the parsed and transformed value", () => {
    expect(
      parseMutationInput(schema, { name: "  data  ", size: "10" }, scope),
    ).toEqual({ ok: true, value: { name: "data", size: 10 } });
  });

  it("reports the first issue as a validation failure", () => {
    const parsed = parseMutationInput(schema, { name: " ", size: 0 }, scope);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.result.error).toEqual({
      code: "validation-failed",
      message: "Enter a name.",
      retryable: false,
    });
    expect(parsed.result.scope).toEqual(scope);
  });
});
