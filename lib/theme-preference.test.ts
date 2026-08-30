import { describe, expect, it } from "vitest";
import { parseSunriseAppearance } from "@/lib/theme-preference";

describe("theme preference", () => {
  it.each(["system", "light", "dark"])(
    "accepts the %s appearance",
    (appearance) => {
      expect(parseSunriseAppearance(appearance)).toBe(appearance);
    },
  );

  it.each([undefined, null, "", "sepia", 1, {}])(
    "rejects invalid appearance values",
    (appearance) => {
      expect(parseSunriseAppearance(appearance)).toBeUndefined();
    },
  );
});
