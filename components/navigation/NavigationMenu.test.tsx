import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/Brand/SunriseBrand", () => ({
  SunriseBrand: () => <span>Sunrise</span>,
}));
vi.mock("@/components/navigation/ServicesMenu", () => ({
  ServicesMenu: () => <button type="button">Services</button>,
}));
vi.mock("@/components/navigation/GlobalCommandPalette", () => ({
  GlobalCommandPalette: () => <button type="button">Search</button>,
}));
vi.mock("@/components/navigation/CloudContextControls", () => ({
  CloudContextControls: () => <span>Cloud context</span>,
}));
vi.mock("@/components/navigation/UserMenu", () => ({
  UserMenu: () => <span>User</span>,
}));
vi.mock("@/components/navigation/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

import { NavigationMenu } from "@/components/navigation/NavigationMenu";

describe("NavigationMenu", () => {
  it("keeps search in an independent centered track", () => {
    const html = renderToStaticMarkup(<NavigationMenu />);

    expect(html).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(html).toContain(
      "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
    );
    expect(html).toContain(
      "xl:grid-cols-[minmax(0,1fr)_minmax(18rem,20rem)_minmax(0,1fr)]",
    );
    expect(html).toContain("justify-self-start");
    expect(html).toContain("justify-self-end");
  });

  it("reserves full feedback text for wide desktop layouts", () => {
    const html = renderToStaticMarkup(<NavigationMenu />);

    expect(html).toContain("hidden list-none min-[1600px]:block");
    expect(html).toContain("max-[383px]:hidden");
  });
});
