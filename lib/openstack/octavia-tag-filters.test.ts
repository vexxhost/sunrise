import { describe, expect, it } from "vitest";

import {
  loadBalancerMatchesTagFilter,
  octaviaTagFilterError,
  octaviaTagFilterShareUrl,
  parseOctaviaTagFilterSearchParams,
  withOctaviaTagFilter,
} from "./octavia-tag-filters";

describe("Octavia load balancer tag filters", () => {
  it("matches all or any exact tags, with no substring or case folding", () => {
    const loadBalancer = { tags: ["env:test", " team\\support\r\n"] };
    expect(
      loadBalancerMatchesTagFilter(loadBalancer, {
        mode: "all",
        tags: [" team\\support\r\n", "env:test"],
      }),
    ).toBe(true);
    expect(
      loadBalancerMatchesTagFilter(loadBalancer, {
        mode: "all",
        tags: ["env:test", "ENV:TEST"],
      }),
    ).toBe(false);
    expect(
      loadBalancerMatchesTagFilter(loadBalancer, {
        mode: "any",
        tags: ["env:prod", "env:test"],
      }),
    ).toBe(true);
    expect(
      loadBalancerMatchesTagFilter(loadBalancer, {
        mode: "any",
        tags: ["env", "team\\support"],
      }),
    ).toBe(false);
  });

  it("does not match empty or omitted tags", () => {
    const filter = { mode: "any", tags: ["env:test"] } as const;
    for (const loadBalancer of [{}, { tags: [] }]) {
      expect(
        loadBalancerMatchesTagFilter(loadBalancer, {
          mode: filter.mode,
          tags: [...filter.tags],
        }),
      ).toBe(false);
    }
  });

  it("restores repeated URL parameters verbatim, defaulting to all", () => {
    expect(parseOctaviaTagFilterSearchParams({})).toEqual({});
    expect(parseOctaviaTagFilterSearchParams({ tag: "env:test" })).toEqual({
      filter: { mode: "all", tags: ["env:test"] },
    });
    const tags = [" team\\support\r\n", "label&+=*"];
    const params = withOctaviaTagFilter("other=1&tag=old", {
      mode: "any",
      tags,
    });
    expect(
      parseOctaviaTagFilterSearchParams({
        tag: params.getAll("tag"),
        "tag-mode": params.getAll("tag-mode")[0],
      }),
    ).toEqual({ filter: { mode: "any", tags } });
    expect(withOctaviaTagFilter(params.toString()).toString()).toBe("other=1");
  });

  it.each([
    { "tag-mode": ["all", "any"], tag: "env:test" },
    { "tag-mode": "all" },
    { "tag-mode": "bogus", tag: "env:test" },
    { tag: "" },
    { tag: ["env:test", "env:test"] },
    { tag: "prod/deploy" },
    { tag: "prod,deploy" },
    { tag: "x".repeat(61) },
    { tag: Array.from({ length: 51 }, (_, index) => `env:${index}`) },
  ])("rejects invalid filter parameters: %j", (params) => {
    expect(parseOctaviaTagFilterSearchParams(params)).toEqual({
      error: expect.any(String),
    });
  });

  it("bounds the encoded query length even for individually valid tags", () => {
    const tags = Array.from(
      { length: 10 },
      (_, index) => "\u00e9".repeat(59) + index,
    );
    expect(octaviaTagFilterError({ mode: "all", tags })).toBeNull();
    expect(
      octaviaTagFilterError({
        mode: "any",
        tags: [...tags, "\u00e9".repeat(59) + "x", "\u00e9".repeat(59) + "y"],
      }),
    ).toContain("too long");
  });

  it("does not open the creation wizard from a shared filter link", () => {
    expect(
      octaviaTagFilterShareUrl(
        "https://sunrise.example/networking/load-balancers?tag=env%3Atest&create=load-balancer",
      ),
    ).toBe("https://sunrise.example/networking/load-balancers?tag=env%3Atest");
  });
});
