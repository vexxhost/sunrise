import { describe, expect, it } from "vitest";

import {
  neutronTagFilterApiQuery,
  neutronTagFilterError,
  neutronTagFilterHref,
  neutronTagFilterQueryKey,
  neutronTagFilterShareUrl,
  parseNeutronTagFilterInput,
  parseNeutronTagFilterSearchParams,
  withNeutronTagFilter,
} from "@/lib/openstack/neutron-tag-filters";

describe("Neutron tag filters", () => {
  it("parses repeated exact tags with all matching as the default", () => {
    expect(
      parseNeutronTagFilterSearchParams({
        tag: ["env:test", " team:platform "],
      }),
    ).toEqual({
      filter: {
        mode: "all",
        tags: ["env:test", " team:platform "],
      },
    });
  });

  it("parses any matching and serializes the Neutron query", () => {
    const parsed = parseNeutronTagFilterSearchParams({
      tag: ["env:test", "env:staging"],
      "tag-mode": "any",
    });

    expect(parsed.filter).toEqual({
      mode: "any",
      tags: ["env:test", "env:staging"],
    });
    expect(neutronTagFilterApiQuery(parsed.filter!)).toEqual({
      "tags-any": "env:test,env:staging",
    });
    expect(neutronTagFilterQueryKey(parsed.filter)).toEqual([
      "any",
      "env:test",
      "env:staging",
    ]);
  });

  it("rejects filters the Neutron list syntax cannot represent exactly", () => {
    expect(neutronTagFilterError({ mode: "all", tags: [""] })).toContain(
      "Empty tags",
    );
    expect(
      neutronTagFilterError({ mode: "all", tags: ["team:a,b"] }),
    ).toContain("reserves commas");
    expect(
      neutronTagFilterError({ mode: "all", tags: ["env:test", "env:test"] }),
    ).toContain("duplicate");
  });

  it("reports malformed shareable URL state instead of ignoring it", () => {
    expect(
      parseNeutronTagFilterSearchParams({
        tag: "env:test",
        "tag-mode": "neither",
      }),
    ).toEqual({ error: "Select whether all tags or any tag must match." });
    expect(parseNeutronTagFilterSearchParams({ "tag-mode": "all" })).toEqual({
      error: "Add at least one tag.",
    });
  });

  it("rejects malformed server-action input", () => {
    expect(parseNeutronTagFilterInput(null)).toEqual({
      error: "Add a valid tag filter.",
    });
    expect(parseNeutronTagFilterInput({ mode: "all", tags: [7] })).toEqual({
      error: "Add a valid tag filter.",
    });
  });

  it("keeps exact filters in shared URLs without transient create actions", () => {
    expect(
      neutronTagFilterShareUrl(
        "https://sunrise.example/networking/networks?tag=env%3Atest&tag=team%3Aplatform&tag-mode=any&create=network",
      ),
    ).toBe(
      "https://sunrise.example/networking/networks?tag=env%3Atest&tag=team%3Aplatform&tag-mode=any",
    );
  });

  it("builds exact collection links and replaces stale filter state", () => {
    expect(
      withNeutronTagFilter("create=network&tag=old&tag-mode=any", {
        mode: "all",
        tags: ["env:test", " team:platform "],
      }).toString(),
    ).toBe("create=network&tag=env%3Atest&tag=+team%3Aplatform+");
    expect(
      neutronTagFilterHref("/networking/networks", {
        mode: "any",
        tags: ["env:test", "env:staging"],
      }),
    ).toBe(
      "/networking/networks?tag=env%3Atest&tag=env%3Astaging&tag-mode=any",
    );
  });
});
