import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthRecovery } from "@/components/Auth/AuthRecovery";

const identity = {
  subject: "user-123",
  displayName: "Sunrise Operator",
  email: "operator@example.test",
  preferredUsername: "operator@example.test",
  issuer: "https://identity.example.test/realms/demo",
  identityProvider: "demo",
};

describe("AuthRecovery", () => {
  it("keeps identity and account recovery actions visible without projects", () => {
    const html = renderToStaticMarkup(
      <AuthRecovery identity={identity} reason="no-projects" />,
    );

    expect(html).toContain("No projects are assigned");
    expect(html).toContain("Sunrise Operator");
    expect(html).toContain("operator@example.test");
    expect(html).toContain('href="/auth/logout?mode=switch"');
    expect(html).toContain("Switch account");
    expect(html).toContain('href="/auth/logout"');
    expect(html).toContain("Sign out");
  });

  it("explains role and federation failures without exposing diagnostics", () => {
    const noRole = renderToStaticMarkup(
      <AuthRecovery identity={identity} reason="no-role" />,
    );
    const federation = renderToStaticMarkup(
      <AuthRecovery identity={identity} reason="federation-failed" />,
    );

    expect(noRole).toContain("No usable project role");
    expect(federation).toContain("Cloud sign-in could not be completed");
    expect(federation).not.toContain("stack");
  });
});
