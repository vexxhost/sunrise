import { describe, expect, it } from "vitest";

import { removeBarbicanPageItem } from "@/lib/openstack/barbican-cache";

describe("removeBarbicanPageItem", () => {
  it("removes a deleted resource from the cached collection", () => {
    expect(
      removeBarbicanPageItem(
        { items: [{ id: "one" }, { id: "two" }], total: 2 },
        "one",
      ),
    ).toEqual({ items: [{ id: "two" }], total: 1 });
  });

  it("keeps an unrelated page unchanged", () => {
    const page = { items: [{ id: "one" }], total: 1 };
    expect(removeBarbicanPageItem(page, "two")).toBe(page);
  });
});
