import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapPin } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/navigation-menu", () => ({
  NavigationMenuTrigger: ({
    children,
    ...props
  }: ComponentProps<"button">) => <button {...props}>{children}</button>,
  NavigationMenuContent: ({
    children,
    ...props
  }: ComponentProps<"div">) => <div {...props}>{children}</div>,
}));

import { Selector } from "@/components/navigation/Selector";

describe("Selector", () => {
  it("end-aligns its menu without exposing an icon-only label visually", () => {
    const items = [
      { id: "region-one", name: "RegionOne" },
      { id: "region-two", name: "RegionTwo" },
    ];
    const html = renderToStaticMarkup(
      <Selector
        items={items}
        selectedItem={items[0]}
        icon={MapPin}
        displayKey="name"
        onSelect={vi.fn(async () => undefined)}
        iconOnly
      />,
    );

    const trigger = html.match(
      /<button[^>]*aria-label="RegionOne"[^>]*>(.*?)<\/button>/,
    );

    expect(trigger?.[1]).not.toContain("RegionOne");
    expect(html).toContain('title="RegionOne"');
    expect(html).toContain('class="right-0 left-auto"');
  });
});
