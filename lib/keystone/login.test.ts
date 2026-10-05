import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readPrefs: vi.fn(),
  writePrefs: vi.fn(),
}));

vi.mock("@/lib/prefs", () => ({
  readPrefs: mocks.readPrefs,
  writePrefs: mocks.writePrefs,
}));

import {
  finalizeKeystoneSession,
  KeystoneSessionSetupError,
} from "@/lib/keystone/login";
import type { Project, Region } from "@/types/openstack/keystone";

function project(id: string, name: string): Project {
  return {
    id,
    name,
    domain_id: "default",
    description: "",
    enabled: true,
    parent_id: "",
    is_domain: false,
    tags: [],
    options: {},
    links: { self: `https://identity.example.test/v3/projects/${id}` },
  };
}

const region: Region = {
  id: "RegionOne",
  links: { self: "https://identity.example.test/v3/regions/RegionOne" },
};

function session() {
  return {
    oidcIdentity: {
      issuer: "https://identity.example.test/realms/demo",
      subject: "user-one",
    },
  } as Parameters<typeof finalizeKeystoneSession>[0];
}

function requestUrl(input: string | URL | Request) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

describe("Keystone session finalization", () => {
  beforeEach(() => {
    process.env.KEYSTONE_API = "https://identity.example.test";
    mocks.readPrefs.mockResolvedValue({});
    mocks.writePrefs.mockResolvedValue(undefined);
  });

  it("classifies an identity with no assigned projects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = requestUrl(input);
        if (url.endsWith("/v3/auth/projects")) {
          return Response.json({ projects: [] });
        }
        if (url.endsWith("/v3/regions")) {
          return Response.json({ regions: [region] });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const current = session();

    await expect(
      finalizeKeystoneSession(current, "unscoped-token"),
    ).resolves.toEqual({ status: "no-projects", region });
    expect(current).toMatchObject({
      keystone_unscoped_token: "unscoped-token",
      regionId: "RegionOne",
    });
    expect(current.projectId).toBeUndefined();
    expect(current.keystoneProjectToken).toBeUndefined();
  });

  it("selects the next usable project when a preferred role is denied", async () => {
    const first = project("project-a", "Project A");
    const second = project("project-b", "Project B");
    mocks.readPrefs.mockResolvedValue({ projectId: first.id });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/v3/auth/projects")) {
          return Response.json({ projects: [first, second] });
        }
        if (url.endsWith("/v3/regions")) {
          return Response.json({ regions: [region] });
        }
        if (url.endsWith("/v3/auth/tokens") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as {
            auth: { scope: { project: { id: string } } };
          };
          if (body.auth.scope.project.id === first.id) {
            return new Response(null, { status: 403 });
          }
          return Response.json(
            {
              token: {
                user: { name: "Sunrise Operator" },
                roles: [
                  { id: "member-id", name: "member" },
                  { id: "reader-id", name: "reader" },
                ],
                catalog: [
                  {
                    name: "s3",
                    type: "object-storage-s3",
                    endpoints: [],
                  },
                ],
              },
            },
            {
              status: 201,
              headers: { "X-Subject-Token": "project-b-token" },
            },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const current = session();

    await expect(
      finalizeKeystoneSession(current, "unscoped-token"),
    ).resolves.toEqual({
      status: "ready",
      project: second,
      region,
      projects: [first, second],
      regions: [region],
      catalog: [{ name: "s3", type: "object-storage-s3", endpoints: [] }],
      userName: "Sunrise Operator",
    });
    expect(current.projectId).toBe(second.id);
    expect(current.keystoneProjectToken).toBe("project-b-token");
    expect(current.keystoneProjectRoles).toEqual([
      { id: "member-id", name: "member" },
      { id: "reader-id", name: "reader" },
    ]);
  });

  it("classifies identities whose project roles all reject scoping", async () => {
    const onlyProject = project("project-a", "Project A");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/v3/auth/projects")) {
          return Response.json({ projects: [onlyProject] });
        }
        if (url.endsWith("/v3/regions")) {
          return Response.json({ regions: [region] });
        }
        if (url.endsWith("/v3/auth/tokens") && init?.method === "POST") {
          return new Response(null, { status: 403 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const current = session();

    await expect(
      finalizeKeystoneSession(current, "unscoped-token"),
    ).resolves.toEqual({ status: "no-role", region });
    expect(current.projectId).toBeUndefined();
    expect(current.keystoneProjectToken).toBeUndefined();
  });

  it("preserves access-denied discovery as an explicit recovery reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = requestUrl(input);
        if (url.endsWith("/v3/auth/projects")) {
          return new Response(null, { status: 403 });
        }
        if (url.endsWith("/v3/regions")) {
          return Response.json({ regions: [region] });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    await expect(
      finalizeKeystoneSession(session(), "unscoped-token"),
    ).rejects.toMatchObject<Partial<KeystoneSessionSetupError>>({
      reason: "access-denied",
    });
  });
});
