import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResourceTag } from "@/components/Network/NeutronResourceTagsSection";

describe("Neutron resource tag navigation", () => {
  it.each([
    ["network", "/networking/networks", "networks"],
    ["router", "/networking/routers", "routers"],
    ["floating-ip", "/networking/floating-ips", "floating IPs"],
    ["security-group", "/networking/security-groups", "security groups"],
    ["port", "/networking/ports", "ports"],
  ] as const)(
    "links a representable %s tag to its filtered collection",
    (resourceType, collectionPath, pluralLabel) => {
      const markup = renderToStaticMarkup(
        <ResourceTag
          resourceType={resourceType}
          support={{ message: "Supported", status: "supported" }}
          tag="env:test"
        />,
      );

      expect(markup).toContain(
        `href="${collectionPath}?tag=env%3Atest"`,
      );
      expect(markup).toContain(
        `aria-label="Show ${pluralLabel} tagged env:test"`,
      );
    },
  );

  it("keeps links available while capability support is unknown", () => {
    const markup = renderToStaticMarkup(
      <ResourceTag
        resourceType="network"
        support={{ message: "Support is unknown", status: "unknown" }}
        tag="env:test"
      />,
    );

    expect(markup).toContain(
      'href="/networking/networks?tag=env%3Atest"',
    );
  });

  it("does not link tags when collection filtering is unsupported", () => {
    const markup = renderToStaticMarkup(
      <ResourceTag
        resourceType="network"
        support={{
          message: "",
          status: "unsupported",
        }}
        tag="env:test"
      />,
    );

    expect(markup).not.toContain("<a");
    expect(markup).not.toContain("href=");
    expect(markup).toContain(
      'title="Tag filtering is unavailable in this cloud."',
    );
  });

  it("does not link a tag that cannot be represented exactly", () => {
    const markup = renderToStaticMarkup(
      <ResourceTag
        resourceType="network"
        support={{ message: "Supported", status: "supported" }}
        tag="team:a,b"
      />,
    );

    expect(markup).not.toContain("<a");
    expect(markup).toContain(
      'title="This tag cannot be represented exactly in a list filter."',
    );
  });
});
