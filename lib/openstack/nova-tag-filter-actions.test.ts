import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: vi.fn(),
}));
vi.mock("@/lib/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/session")>();
  return { ...original, getSession: vi.fn() };
});

import { listProjectNovaServersByTags } from "@/lib/openstack/nova-tag-filter-actions";
import { OpenStackRequestError } from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession } from "@/lib/session";

const mockedRequest = vi.mocked(openstackRequest);
const mockedSession = vi.mocked(getSession);

function server(
  id: string,
  tags: string[],
  tenantId = "project-a",
): Record<string, unknown> {
  return { id, name: id, status: "ACTIVE", tags, tenant_id: tenantId };
}

describe("Nova tag filter actions", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedSession.mockReset();
    mockedSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    } as Awaited<ReturnType<typeof getSession>>);
  });

  it("lists only owned servers that match every exact tag", async () => {
    mockedRequest.mockResolvedValue({
      servers: [
        server("server-a", ["env:test", "team:platform"]),
        server("server-b", ["env:test"], "project-b"),
        server("server-c", ["env:prod"]),
      ],
    });

    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["env:test", "team:platform"],
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "server-a" })]);
    expect(mockedRequest).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/detail?tags=env%3Atest%2Cteam%3Aplatform&limit=1000",
      apiVersion: "compute 2.79",
      errorMode: "throw",
    });
  });

  it("uses tags-any and verifies OR matching locally", async () => {
    mockedRequest.mockResolvedValue({
      servers: [
        server("server-a", ["env:test"]),
        server("server-b", ["env:prod"]),
      ],
    });

    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "any",
        tags: ["env:test", "env:stage"],
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "server-a" })]);
    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/servers/detail?tags-any=env%3Atest%2Cenv%3Astage&limit=1000",
      }),
    );
  });

  it("lets Nova validate Python-only regex syntax", async () => {
    mockedRequest.mockResolvedValue({
      servers: [server("server-a", ["(?i)env"])],
    });

    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["(?i)env"],
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "server-a" })]);
    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/servers/detail?tags=%28%3Fi%29env&limit=1000",
      }),
    );
  });

  it("falls back to exact local matching when Nova rejects tag query syntax", async () => {
    mockedRequest
      .mockRejectedValueOnce(new OpenStackRequestError(400, "Bad Request"))
      .mockResolvedValueOnce({
        servers: [
          server("server-a", ["["]),
          server("server-b", ["env:test"]),
        ],
        servers_links: [
          { rel: "next", href: "/servers/detail?marker=server-b" },
        ],
      })
      .mockResolvedValueOnce({
        servers: [server("server-c", ["["])],
        servers_links: [],
      });

    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["["],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "server-a" }),
      expect.objectContaining({ id: "server-c" }),
    ]);
    expect(mockedRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: "/servers/detail?tags=%5B&limit=1000",
      }),
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: "/servers/detail?limit=1000" }),
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        path: "/servers/detail?limit=1000&marker=server-b",
      }),
    );
  });

  it("does not hide non-validation failures behind an unfiltered retry", async () => {
    const failure = new OpenStackRequestError(503, "Unavailable");
    mockedRequest.mockRejectedValue(failure);

    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).rejects.toBe(failure);
    expect(mockedRequest).toHaveBeenCalledOnce();
  });

  it("follows validated pagination while preserving the original filter", async () => {
    mockedRequest
      .mockResolvedValueOnce({
        servers: [server("server-a", ["env:test"])],
        servers_links: [
          {
            rel: "next",
            href: "https://nova.example/v2.1/project-a/servers/detail?tags=changed&limit=3&marker=server-a",
          },
        ],
      })
      .mockResolvedValueOnce({
        servers: [server("server-b", ["env:test"])],
        servers_links: [],
      });

    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "server-a" }),
      expect.objectContaining({ id: "server-b" }),
    ]);
    expect(mockedRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: "/servers/detail?tags=env%3Atest&limit=1000&marker=server-a",
      }),
    );
  });

  it("rejects malformed or repeated pagination", async () => {
    mockedRequest.mockResolvedValue({
      servers: [],
      servers_links: [
        { rel: "next", href: "https://nova.example/servers?marker=server-a" },
      ],
    });

    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).rejects.toThrow("Invalid Compute pagination target");

    mockedRequest.mockResolvedValue({
      servers: [server("server-a", ["env:test"])],
      servers_links: [{ rel: "next", href: "/servers/detail?marker=server-a" }],
    });
    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).rejects.toThrow("Invalid Compute pagination");
  });

  it("rejects malformed server responses instead of trusting the API filter", async () => {
    mockedRequest.mockResolvedValue({
      servers: [{ id: "server-a", tenant_id: "project-a" }],
    });

    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).rejects.toThrow("Invalid Compute server response");
  });

  it("rejects stale scope and malformed filters before requesting Nova", async () => {
    await expect(
      listProjectNovaServersByTags("RegionTwo", "project-a", {
        mode: "all",
        tags: ["env:test"],
      }),
    ).rejects.toThrow("region does not match");
    await expect(
      listProjectNovaServersByTags("RegionOne", "project-a", {
        mode: "all",
        tags: ["path/value"],
      }),
    ).rejects.toThrow("slash");
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});
