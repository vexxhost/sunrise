import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(main)/auth/login/action", () => ({
  login: vi.fn(),
}));

import Login from "@/components/Auth/Login";

describe("Login", () => {
  it("uses a neutral heading for a first-time visitor", () => {
    const html = renderToStaticMarkup(<Login />);

    expect(html).toContain("Sign in to Sunrise");
    expect(html).not.toContain("Welcome back");
  });

  it("welcomes a returning visitor back", () => {
    const html = renderToStaticMarkup(<Login returningVisitor />);

    expect(html).toContain("Welcome back");
    expect(html).not.toContain("Sign in to Sunrise");
  });

  it("offers a direct path through the remembered provider", () => {
    const html = renderToStaticMarkup(
      <Login
        rememberedProvider={{
          id: "demo",
          displayName: "VEXXHOST Demo",
        }}
        initialReturnTo="/kubernetes/clusters"
      />,
    );

    expect(html).toContain("Previous identity provider");
    expect(html).toContain("VEXXHOST Demo");
    expect(html).toContain(
      'href="/sign-in/demo?returnTo=%2Fkubernetes%2Fclusters"',
    );
    expect(html).toContain("Copy sign-in link");
    expect(html).toContain("Use another provider");
    expect(html).not.toContain('id="alternative-provider-form"');
  });
});
