import { describe, expect, it } from "vitest";
import { parseIdentityProviders } from "./auth-providers";

describe("identity provider presentation", () => {
  it("normalizes configured provider lists", () => {
    expect(parseIdentityProviders(" demo, workforce_sso, ")).toEqual([
      "demo",
      "workforce_sso",
    ]);
    expect(parseIdentityProviders(undefined)).toEqual([]);
  });
});
