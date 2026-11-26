import { describe, expect, it } from "vitest";
import type { MutationErrorCode } from "@/lib/mutations";
import { poolChildMutationRecovery } from "./octavia-pool-settings";

describe("pool child mutation recovery", () => {
  it.each([
    ["conflict", false, true, true],
    ["conflict", true, true, false],
    ["not-found", true, true, true],
    ["invalid-response", true, true, true],
    ["network-error", false, true, true],
    ["context-changed", false, false, true],
    ["validation-failed", false, false, false],
  ] as const satisfies readonly (readonly [
    MutationErrorCode,
    boolean,
    boolean,
    boolean,
  ])[])(
    "refreshes or locks the dialog after %s (retain draft on conflict: %s)",
    (code, retainDraft, needsRefresh, needsReopen) => {
      expect(poolChildMutationRecovery(code, retainDraft)).toEqual({
        needsRefresh,
        needsReopen,
      });
    },
  );
});
