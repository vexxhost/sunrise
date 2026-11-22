import { describe, expect, it } from "vitest";

import {
  novaTagFilterApiQuery,
  novaTagFilterError,
  novaTagFilterHref,
  novaTagFilterQueryKey,
  novaTagFilterShareUrl,
  parseNovaTagFilterInput,
  parseNovaTagFilterSearchParams,
  serverMatchesNovaTagFilter,
  withNovaTagFilter,
} from "@/lib/openstack/nova-tag-filters";

describe("Nova tag filters", () => {
  it("parses repeated exact tags with all matching by default", () => {
    expect(
      parseNovaTagFilterSearchParams({
        tag: ["env:test", "team:platform"],
      }),
    ).toEqual({
      filter: { mode: "all", tags: ["env:test", "team:platform"] },
    });
  });

  it("parses any matching and rejects malformed URL state", () => {
    expect(
      parseNovaTagFilterSearchParams({
        tag: ["env:test", "env:stage"],
        "tag-mode": "any",
      }),
    ).toEqual({
      filter: { mode: "any", tags: ["env:test", "env:stage"] },
    });
    expect(
      parseNovaTagFilterSearchParams({ tag: "env:test", "tag-mode": "none" }),
    ).toEqual({ error: "Select whether all tags or any tag must match." });
    expect(
      parseNovaTagFilterSearchParams({ "tag-mode": ["all", "any"] }),
    ).toEqual({ error: "Select one tag matching mode." });
  });

  it.each([
    [{ mode: "all", tags: [] }, "Add at least one tag."],
    [{ mode: "all", tags: ["same", "same"] }, "duplicate"],
    [{ mode: "all", tags: ["path/value"] }, "slash"],
    [{ mode: "all", tags: ["one,two"] }, "comma"],
  ] as const)("rejects invalid filters", (filter, message) => {
    expect(novaTagFilterError(filter)).toContain(message);
  });

  it("validates untrusted action input", () => {
    expect(
      parseNovaTagFilterInput({ mode: "all", tags: ["env:test"] }),
    ).toEqual({ filter: { mode: "all", tags: ["env:test"] } });
    expect(parseNovaTagFilterInput({ mode: "all", tags: [7] })).toEqual({
      error: "Add a valid tag filter.",
    });
  });

  it("maps all and any modes to Nova query parameters", () => {
    expect(
      novaTagFilterApiQuery({
        mode: "all",
        tags: ["env:test", "team:platform"],
      }),
    ).toEqual({ tags: "env:test,team:platform" });
    expect(
      novaTagFilterApiQuery({
        mode: "any",
        tags: ["env:test", "env:stage"],
      }),
    ).toEqual({ "tags-any": "env:test,env:stage" });
  });

  it("builds stable query keys and shareable URLs", () => {
    const filter = { mode: "any", tags: ["env:test", "env:stage"] } as const;

    expect(novaTagFilterQueryKey(filter)).toEqual([
      "any",
      "env:test",
      "env:stage",
    ]);
    expect(novaTagFilterHref("/compute/instances", filter)).toBe(
      "/compute/instances?tag=env%3Atest&tag=env%3Astage&tag-mode=any",
    );
    expect(
      withNovaTagFilter("create=instance&deleting=server-a", filter).toString(),
    ).toBe(
      "create=instance&deleting=server-a&tag=env%3Atest&tag=env%3Astage&tag-mode=any",
    );
    expect(
      novaTagFilterShareUrl(
        "https://sunrise.example/compute/instances?create=instance&deleting=server-a&tag=env%3Atest",
      ),
    ).toBe("https://sunrise.example/compute/instances?tag=env%3Atest");
  });

  it("verifies all and any matches against returned tags", () => {
    expect(
      serverMatchesNovaTagFilter(["env:test", "team:platform"], {
        mode: "all",
        tags: ["env:test", "team:platform"],
      }),
    ).toBe(true);
    expect(
      serverMatchesNovaTagFilter(["env:test"], {
        mode: "all",
        tags: ["env:test", "team:platform"],
      }),
    ).toBe(false);
    expect(
      serverMatchesNovaTagFilter(["env:test"], {
        mode: "any",
        tags: ["env:stage", "env:test"],
      }),
    ).toBe(true);
  });
});
