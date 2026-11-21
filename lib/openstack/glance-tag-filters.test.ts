import { describe, expect, it } from "vitest";

import {
  glanceTagFilterApiPath,
  glanceTagFilterError,
  glanceTagFilterHref,
  glanceTagFilterQueryKey,
  glanceTagFilterShareUrl,
  imageMatchesGlanceTagFilter,
  parseGlanceTagFilterSearchParams,
  withGlanceTagFilter,
} from "@/lib/openstack/glance-tag-filters";

describe("Glance tag filters", () => {
  it("parses repeated exact tags with all-tag semantics", () => {
    expect(
      parseGlanceTagFilterSearchParams({ tag: ["env:test", "team:api"] }),
    ).toEqual({ filter: { tags: ["env:test", "team:api"] } });
  });

  it("rejects empty, duplicate, and oversized filters", () => {
    expect(glanceTagFilterError({ tags: [] })).toBe("Add at least one tag.");
    expect(glanceTagFilterError({ tags: [""] })).toContain("Empty tags");
    expect(glanceTagFilterError({ tags: ["env:test", "env:test"] })).toContain(
      "duplicate",
    );
    expect(glanceTagFilterError({ tags: ["a".repeat(256)] })).toContain(
      "255 characters",
    );
    expect(glanceTagFilterError({ tags: [" team:api "] })).toContain(
      "leading or trailing whitespace",
    );
  });

  it("rejects URL filters Glance would silently trim", () => {
    expect(parseGlanceTagFilterSearchParams({ tag: " env:test" })).toEqual({
      error:
        "Tags with leading or trailing whitespace cannot be filtered exactly by the Image service.",
    });
  });

  it("preserves unrelated parameters while replacing tag filters", () => {
    const query = withGlanceTagFilter("create=image&tag=old", {
      tags: ["env:test", "team:api"],
    });

    expect(query.get("create")).toBe("image");
    expect(query.getAll("tag")).toEqual(["env:test", "team:api"]);
    expect(withGlanceTagFilter(query).toString()).toBe("create=image");
  });

  it("builds encoded API paths, collection links, and stable query keys", () => {
    const filter = { tags: ["env:test", "team/api"] };

    expect(glanceTagFilterApiPath("/v2/images", filter)).toBe(
      "/v2/images?tag=env%3Atest&tag=team%2Fapi",
    );
    expect(glanceTagFilterHref("/compute/images", filter)).toBe(
      "/compute/images?tag=env%3Atest&tag=team%2Fapi",
    );
    expect(glanceTagFilterQueryKey(filter)).toEqual(["env:test", "team/api"]);
  });

  it("removes transient create state from copied filtered URLs", () => {
    expect(
      glanceTagFilterShareUrl(
        "https://sunrise.example/compute/images?tag=env%3Atest&create=image",
      ),
    ).toBe("https://sunrise.example/compute/images?tag=env%3Atest");
  });

  it("requires every selected tag to be present on an image", () => {
    const filter = { tags: ["env:test", "team:api"] };

    expect(imageMatchesGlanceTagFilter(["team:api", "env:test"], filter)).toBe(
      true,
    );
    expect(imageMatchesGlanceTagFilter(["env:test"], filter)).toBe(false);
  });
});
