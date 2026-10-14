import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS = "demo-provider";
  process.env.SUNRISE_IDENTITY_PROVIDER_DISPLAY_NAME_DEMO_PROVIDER =
    "VEXXHOST Demo";
  process.env.SUNRISE_IDENTITY_PROVIDER_SIGN_IN_SLUG_DEMO_PROVIDER = "demo";
});

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { LoginFormSchema } from "@/lib/auth";

describe("LoginFormSchema", () => {
  it("translates a public sign-in slug to the exact provider ID", () => {
    expect(LoginFormSchema.parse({ idProvider: "demo" })).toMatchObject({
      idProvider: "demo-provider",
    });
  });

  it("rejects unknown sign-in slugs", () => {
    expect(LoginFormSchema.safeParse({ idProvider: "unknown" }).success).toBe(
      false,
    );
  });
});
