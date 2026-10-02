import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditActionButton } from "@/components/resources/EditActionButton";

describe("EditActionButton", () => {
  it("renders a labeled outline action for resource headers", () => {
    const html = renderToStaticMarkup(<EditActionButton label="Edit volume" />);

    expect(html).toContain('aria-label="Edit volume"');
    expect(html).toContain("border");
    expect(html).toContain(">Edit</button>");
  });

  it("renders a compact ghost action with an accessible label", () => {
    const html = renderToStaticMarkup(
      <EditActionButton compact label="Edit route" />,
    );

    expect(html).toContain('aria-label="Edit route"');
    expect(html).toContain("size-8");
    expect(html).toContain("sr-only");
  });
});
