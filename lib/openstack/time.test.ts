import { describe, expect, it } from "vitest";
import { formatAge, normalizeOpenStackTimestamp } from "./time";

describe("normalizeOpenStackTimestamp", () => {
  it("marks naive OpenStack timestamps as UTC", () => {
    expect(normalizeOpenStackTimestamp("2026-08-30T09:51:07.000000")).toBe(
      "2026-08-30T09:51:07.000000Z",
    );
  });

  it.each([
    "2026-08-30T09:51:07Z",
    "2026-08-30T09:51:07+03:00",
    "2026-08-30T09:51:07-0400",
  ])("preserves timestamps with an explicit timezone: %s", (value) => {
    expect(normalizeOpenStackTimestamp(value)).toBe(value);
  });
});

describe("formatAge", () => {
  const now = new Date("2026-08-31T10:00:00Z");

  it("formats a suffix-free resource age", () => {
    expect(formatAge("2026-08-31T06:00:00", now)).toBe("about 4 hours");
  });

  it.each([null, undefined, "", "not-a-date"])(
    "returns a dash for %s",
    (value) => {
      expect(formatAge(value, now)).toBe("-");
    },
  );
});
