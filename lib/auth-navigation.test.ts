import { describe, expect, it } from "vitest";
import {
  authReturnToFromLocation,
  identityProviderSignInPath,
  sessionLogoutPath,
} from "@/lib/auth-navigation";

describe("authentication navigation", () => {
  it("preserves a console path and its query parameters", () => {
    expect(
      authReturnToFromLocation({
        pathname: "/console/project-1/server-1",
        search: "?protocol=vnc&region=RegionOne",
        hash: "",
      }),
    ).toBe("/console/project-1/server-1?protocol=vnc&region=RegionOne");
  });

  it("builds a bookmarkable provider link with an encoded destination", () => {
    expect(identityProviderSignInPath("demo", "/kubernetes/clusters")).toBe(
      "/sign-in/demo?returnTo=%2Fkubernetes%2Fclusters",
    );
  });

  it("keeps account-selection prompts out of the destination value", () => {
    expect(
      identityProviderSignInPath(
        "workforce-sso",
        "/compute/instances?status=active",
        "select_account",
      ),
    ).toBe(
      "/sign-in/workforce-sso?returnTo=%2Fcompute%2Finstances%3Fstatus%3Dactive&prompt=select_account",
    );
  });

  it("builds a session-renewal path without accepting external redirects", () => {
    expect(
      sessionLogoutPath("idle", "https://attacker.example", "switch"),
    ).toBe("/auth/logout?reason=idle&mode=switch");
  });
});
