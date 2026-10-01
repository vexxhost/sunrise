import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthScene } from "@/components/Auth/AuthScene";

describe("AuthScene", () => {
  it("uses palette tokens for the brand, scene, and sign-in surface", () => {
    const html = renderToStaticMarkup(
      <AuthScene>
        <p>Sign in</p>
      </AuthScene>,
    );

    expect(html).toContain("sunrise-auth-scene");
    expect(html).toContain("var(--sunrise-auth-sky)");
    expect(html).toContain("var(--sunrise-auth-sun)");
    expect(html).toContain("var(--sunrise-auth-cloud-floor)");
    expect(html).toContain("var(--brand-sun)");
    expect(html).toContain("bg-card/90");
    expect(html).not.toContain("dark:bg-");
  });
});
