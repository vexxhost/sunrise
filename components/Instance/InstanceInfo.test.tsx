import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InstanceInfo } from "@/components/Instance/InstanceInfo";
import type { Server } from "@/types/openstack";

function server(overrides: Partial<Server> = {}) {
  return {
    id: "server-a",
    tenant_id: "project-a",
    name: "application server",
    description: null,
    status: "ACTIVE",
    metadata: {},
    tags: [],
    created: "2026-11-21T08:00:00Z",
    key_name: "operator-key",
    config_drive: "",
    "OS-DCF:diskConfig": "AUTO",
    "OS-EXT-AZ:availability_zone": "nova",
    "OS-EXT-STS:power_state": 1,
    ...overrides,
  } as Server;
}

describe("instance information", () => {
  it("renders Nova tags as exact opaque values", () => {
    const markup = renderToStaticMarkup(
      <InstanceInfo
        server={server({ tags: ["env:test", "Team:Platform"] })}
      />,
    );

    expect(markup).toContain("env:test");
    expect(markup).toContain("Team:Platform");
    expect(markup).not.toContain("tag%3Aenv");
  });

  it("renders a stable empty state when tags are absent", () => {
    const markup = renderToStaticMarkup(
      <InstanceInfo server={server({ tags: undefined })} />,
    );

    expect(markup).toContain("Tags");
    expect(markup).not.toContain("env:test");
  });
});
