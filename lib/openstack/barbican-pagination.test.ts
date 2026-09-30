import { describe, expect, it } from "vitest";

import { appendUniqueBy } from "@/lib/openstack/barbican-pagination";

describe("appendUniqueBy", () => {
  it("keeps the first resource when offset pages overlap", () => {
    const items = [{ id: "one" }, { id: "two" }];
    const seen = new Set(items.map(({ id }) => id));

    appendUniqueBy(
      items,
      seen,
      [{ id: "two" }, { id: "three" }, { id: "three" }],
      ({ id }) => id,
    );

    expect(items).toEqual([{ id: "one" }, { id: "two" }, { id: "three" }]);
  });
});
