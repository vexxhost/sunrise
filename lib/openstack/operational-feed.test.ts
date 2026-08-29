import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/openstack/catalog", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/openstack/catalog")>();
  return {
    ...original,
    getServiceCatalog: mocks.getServiceCatalog,
  };
});

import type { OpenStackCatalogService } from "@/lib/openstack/catalog";
import { loadOperationalFeed } from "@/lib/openstack/operational-feed";

const catalog: OpenStackCatalogService[] = [
  {
    name: "nova",
    type: "compute",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://nova.example.test/v2.1",
      },
    ],
  },
  {
    name: "cinder",
    type: "volumev3",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://cinder.example.test/v3/project-id",
      },
    ],
  },
  {
    name: "glance",
    type: "image",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://glance.example.test",
      },
    ],
  },
  {
    name: "magnum",
    type: "container-infra",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://magnum.example.test/v1",
      },
    ],
  },
];

const now = Date.parse("2026-08-29T12:00:00Z");
const payloads: Record<string, unknown> = {
  "https://nova.example.test/v2.1/servers/detail?status=ERROR&project_id=project-id&limit=20":
    {
      servers: [
        {
          id: "server-id",
          name: "broken-server",
          tenant_id: "project-id",
          status: "ERROR",
          updated: "2026-08-29T11:40:00Z",
        },
        {
          id: "foreign-server",
          name: "not-ours",
          tenant_id: "another-project",
          status: "ERROR",
        },
      ],
    },
  "https://cinder.example.test/v3/project-id/messages?limit=20&sort=created_at%3Adesc":
    {
      messages: [
        {
          id: "message-id",
          message_level: "ERROR",
          resource_type: "VOLUME",
          resource_uuid: "volume-id",
          user_message: "No storage could be allocated.",
          created_at: "2026-08-28T12:00:00Z",
        },
        {
          id: "old-message",
          message_level: "ERROR",
          resource_type: "VOLUME",
          created_at: "2026-08-01T12:00:00Z",
        },
      ],
    },
  "https://glance.example.test/v2/images?status=killed&owner=project-id&limit=20&sort=updated_at%3Adesc":
    {
      images: [
        {
          id: "image-id",
          name: "broken-image",
          owner: "project-id",
          status: "killed",
          updated_at: "2026-08-29T11:30:00Z",
        },
        {
          id: "foreign-image",
          owner: "another-project",
          status: "killed",
        },
      ],
    },
  "https://magnum.example.test/v1/clusters?project_id=project-id": {
    clusters: [
      { uuid: "failed-cluster" },
      { uuid: "unhealthy-cluster" },
      { uuid: "foreign-cluster" },
    ],
  },
  "https://magnum.example.test/v1/clusters/failed-cluster": {
    uuid: "failed-cluster",
    name: "failed-k8s",
    project_id: "project-id",
    status: "CREATE_FAILED",
    status_reason: "Stack creation failed.",
    updated_at: "2026-08-29T11:00:00Z",
  },
  "https://magnum.example.test/v1/clusters/unhealthy-cluster": {
    cluster: {
      uuid: "unhealthy-cluster",
      name: "unhealthy-k8s",
      project_id: "project-id",
      status: "UPDATE_COMPLETE",
      health_status: "UNHEALTHY",
      health_status_reason: { node: "A worker is not ready." },
      updated_at: "2026-08-29T10:00:00Z",
    },
  },
  "https://magnum.example.test/v1/clusters/foreign-cluster": {
    uuid: "foreign-cluster",
    name: "not-ours",
    project_id: "another-project",
    status: "CREATE_FAILED",
  },
};

describe("operational feed loading", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getServiceCatalog.mockReset();
    mocks.redirect.mockClear();
  });

  it("loads bounded, active-project operational signals from each service", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (!(url in payloads)) throw new Error(`Unexpected URL: ${url}`);
      return Response.json(payloads[url]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadOperationalFeed({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
      catalog,
      now,
    });

    expect(result.sources).toEqual([
      expect.objectContaining({ id: "compute", status: "available" }),
      expect.objectContaining({ id: "block-storage", status: "available" }),
      expect.objectContaining({ id: "images", status: "available" }),
      expect.objectContaining({ id: "kubernetes", status: "available" }),
    ]);
    expect(result.signals.map((signal) => signal.id)).toEqual([
      "compute:server-id",
      "block-storage:message-id",
      "image:image-id",
      "kubernetes:failed-cluster",
      "kubernetes:unhealthy-cluster",
    ]);
    expect(result.signals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringContaining("foreign") }),
      ]),
    );
    expect(mocks.getServiceCatalog).not.toHaveBeenCalled();
  });

  it("reports per-source coverage failures without discarding healthy sources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("nova.example.test")) {
          return new Response(null, { status: 403, statusText: "Forbidden" });
        }
        if (url.includes("glance.example.test")) {
          return new Response(null, { status: 404, statusText: "Not Found" });
        }
        if (url.includes("magnum.example.test")) {
          return Response.json({ clusters: [] });
        }
        return Response.json({ messages: [] });
      }),
    );

    const result = await loadOperationalFeed({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
      catalog,
      now,
    });

    expect(result.sources.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "compute", status: "forbidden" },
      { id: "block-storage", status: "available" },
      { id: "images", status: "unavailable" },
      { id: "kubernetes", status: "available" },
    ]);
  });

  it("does not scan unscoped Magnum clusters when project filtering is unsupported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("magnum.example.test")) {
          return new Response(null, { status: 400, statusText: "Bad Request" });
        }
        if (url.includes("nova.example.test")) {
          return Response.json({ servers: [] });
        }
        if (url.includes("glance.example.test")) {
          return Response.json({ images: [] });
        }
        return Response.json({ messages: [] });
      }),
    );

    const result = await loadOperationalFeed({
      token: "project-token",
      regionId: "RegionOne",
      projectId: "project-id",
      catalog,
      now,
    });

    expect(result.sources.find((source) => source.id === "kubernetes"))
      .toMatchObject({
        status: "unavailable",
        message: "Project-scoped resource health is not supported",
      });
    expect(result.signals).toEqual([]);
  });

  it("redirects when a resource check reports an expired token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, { status: 401, statusText: "Unauthorized" }),
      ),
    );

    await expect(
      loadOperationalFeed({
        token: "expired-token",
        regionId: "RegionOne",
        projectId: "project-id",
        catalog,
        now,
      }),
    ).rejects.toThrow("redirect:/auth/logout?reason=expired");
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth/logout?reason=expired",
    );
  });
});
