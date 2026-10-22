import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS = "demo-provider";
  process.env.SUNRISE_IDENTITY_PROVIDER_DISPLAY_NAME_DEMO_PROVIDER =
    "VEXXHOST Demo";
});

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { LoginFormSchema } from "@/lib/auth";

describe("LoginFormSchema", () => {
  it("accepts an exact configured provider ID", () => {
    expect(LoginFormSchema.parse({ idProvider: "demo-provider" })).toMatchObject({
      idProvider: "demo-provider",
    });
  });

  it("rejects unknown provider IDs", () => {
    expect(LoginFormSchema.safeParse({ idProvider: "unknown" }).success).toBe(
      false,
    );
  });

  it("does not read provider configuration while the module loads", async () => {
    const configuredProviders =
      process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS;
    delete process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS;
    vi.resetModules();

    try {
      await expect(import("@/lib/auth")).resolves.toHaveProperty(
        "LoginFormSchema",
      );
    } finally {
      process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS = configuredProviders;
    }
  });
});
