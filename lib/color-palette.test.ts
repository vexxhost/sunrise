import { describe, expect, it } from "vitest";
import {
  getSunriseColorPalette,
  parseSunriseColorPalette,
} from "@/lib/color-palette";

describe("Sunrise color palette", () => {
  it("accepts supported deployment palettes", () => {
    expect(parseSunriseColorPalette("sunrise")).toBe("sunrise");
    expect(parseSunriseColorPalette("vexxhost")).toBe("vexxhost");
  });

  it("falls back to the Sunrise palette for missing or invalid values", () => {
    expect(getSunriseColorPalette(undefined)).toBe("sunrise");
    expect(getSunriseColorPalette("unknown")).toBe("sunrise");
  });
});
