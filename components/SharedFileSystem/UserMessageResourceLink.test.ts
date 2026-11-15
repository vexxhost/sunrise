import { describe, expect, it } from "vitest";

import {
  formatUserMessageResourceType,
  userMessageResourceHref,
} from "@/components/SharedFileSystem/UserMessageResourceLink";

describe("Manila user message resource links", () => {
  it("links share-network diagnostics to the share-network detail view", () => {
    expect(
      userMessageResourceHref({
        resource_id: "network/id",
        resource_type: "SHARE_NETWORK",
      }),
    ).toBe("/shared-file-systems/share-networks/network%2Fid");
    expect(formatUserMessageResourceType("SHARE_NETWORK")).toBe(
      "Share network",
    );
  });

  it("leaves unsupported resource types unlinked", () => {
    expect(
      userMessageResourceHref({
        resource_id: "group-id",
        resource_type: "SHARE_GROUP",
      }),
    ).toBeUndefined();
  });
});
