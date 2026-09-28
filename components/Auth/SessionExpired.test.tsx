import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionExpired } from "@/components/Auth/SessionExpired";

const identity = {
  subject: "user-123",
  displayName: "Tadas Sutkaitis",
  email: "tadasas@gmail.com",
  preferredUsername: "tadasas@gmail.com",
  issuer: "https://identity.example.test/realms/demo",
  identityProvider: "demo",
};

describe("SessionExpired", () => {
  it("offers same-account renewal and explicit account switching", () => {
    const html = renderToStaticMarkup(
      <SessionExpired identity={identity} reason="absolute" />,
    );

    expect(html).toContain("maximum lifetime");
    expect(html).toContain("tadasas@gmail.com");
    expect(html).toContain('href="/auth/logout?reason=absolute"');
    expect(html).toContain(
      'href="/auth/logout?reason=absolute&amp;mode=switch"',
    );
    expect(html).toContain("Sign in again");
    expect(html).toContain("Switch account");
  });
});
