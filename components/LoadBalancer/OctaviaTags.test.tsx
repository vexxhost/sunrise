import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OctaviaTagList } from "@/components/LoadBalancer/OctaviaTags";

describe("OctaviaTagList", () => {
  it("renders exact tag values without hiding ambiguous whitespace", () => {
    const markup = renderToStaticMarkup(
      <OctaviaTagList tags={["env:test", " leading space"]} />,
    );

    expect(markup).toContain("env:test");
    expect(markup).toContain("&quot; leading space&quot;");
  });

  it("renders an explicit empty state", () => {
    expect(renderToStaticMarkup(<OctaviaTagList tags={[]} />)).toContain(
      "None",
    );
  });

  it("distinguishes omitted tags from an empty set", () => {
    expect(renderToStaticMarkup(<OctaviaTagList />)).toContain("Unavailable");
  });
});
