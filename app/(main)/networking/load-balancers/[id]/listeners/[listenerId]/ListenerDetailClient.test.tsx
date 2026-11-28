import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useQueryClient: () => ({}),
  useSuspenseQuery: mocks.useSuspenseQuery,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/hooks/queries/useLoadBalancers", () => ({
  loadBalancerListenerDetailsQueryOptions: () => ({}),
  loadBalancerPoolChoicesQueryOptions: () => ({ queryKey: ["pool-choices"] }),
  loadBalancerListenerRoutingQueryOptions: () => ({ queryKey: ["routing"] }),
}));
vi.mock("@/components/LoadBalancer/ListenerMutationDialog", () => ({
  ListenerMutationDialog: () => null,
}));
vi.mock("@/components/LoadBalancer/L7PolicyDialog", () => ({
  L7PolicyDialog: () => null,
}));

import { ListenerDetailClient } from "./ListenerDetailClient";
import type { OctaviaListener } from "@/types/openstack";

const loadBalancerId = "11111111-1111-4111-8111-111111111111";
const listenerId = "22222222-2222-4222-8222-222222222222";
const loadBalancer = {
  id: loadBalancerId,
  name: "load-balancer",
  provider: "amphorav2",
  listeners: [{ id: listenerId }] as Array<{ id: string } | null>,
  provisioning_status: "ACTIVE",
};
const listener: Partial<OctaviaListener> = {
  id: listenerId,
  name: "http",
  protocol: "HTTP",
  protocol_port: 80,
  default_pool_id: null,
  l7policies: [],
  provisioning_status: "ACTIVE",
};

function renderDetails({
  parent = {},
  child = {},
  isFetching = false,
  isRefetchError = false,
  routing = {},
  pools = [],
  barbicanNames = {},
}: {
  parent?: Partial<typeof loadBalancer>;
  child?: Partial<OctaviaListener>;
  isFetching?: boolean;
  isRefetchError?: boolean;
  routing?: Record<string, unknown>;
  pools?: Array<Record<string, unknown>>;
  barbicanNames?: Record<string, string>;
} = {}) {
  mocks.useQuery.mockImplementation(({ queryKey }) => {
    if (queryKey?.[3] === "octavia-reference-names")
      return { data: barbicanNames };
    return queryKey?.[0] === "routing" ? routing : { data: pools };
  });
  mocks.useSuspenseQuery.mockReturnValue({
    data: {
      loadBalancer: { ...loadBalancer, ...parent },
      listener: { ...listener, ...child },
      capabilities: { discoveryStatus: "unavailable" },
      stats: null,
    },
    isFetching,
    isRefetchError,
  });
  return renderToStaticMarkup(
    <ListenerDetailClient
      loadBalancerId={loadBalancerId}
      listenerId={listenerId}
      projectId="project-a"
      regionId="RegionOne"
    />,
  );
}

function deleteListenerButton(markup: string) {
  return markup.match(
    /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Delete listener<\/button>/,
  )?.[0];
}

describe("listener detail deletion", () => {
  it.each(["ACTIVE", "ERROR"])(
    "offers deletion for a settled listener: %s",
    (provisioning_status) => {
      const markup = renderDetails({ child: { provisioning_status } });
      const button = deleteListenerButton(markup);
      expect(button).toBeDefined();
      expect(button).not.toContain(' disabled=""');
      expect(markup).toContain(
        `href="/networking/load-balancers/${loadBalancerId}#listeners"`,
      );
    },
  );

  it.each([
    { parent: { listeners: [] } },
    { parent: { listeners: undefined } },
    { parent: { listeners: [null] } },
    { parent: { provisioning_status: "PENDING_UPDATE" } },
    { child: { provisioning_status: "PENDING_DELETE" } },
    { isFetching: true },
    { isRefetchError: true },
  ])(
    "disables deletion when the current topology is unsettled or unverified: %j",
    (changes) => {
      expect(deleteListenerButton(renderDetails(changes))).toContain(
        ' disabled=""',
      );
    },
  );
});

it("deep-links every listener TLS reference with a descriptive label", () => {
  const id = "aaaa1111-1111-4111-8111-111111111111";
  const secret = `https://barbican.example/v1/secrets/${id}`;
  const container = `https://barbican.example/key-manager/v1/containers/${id}`;
  const markup = renderDetails({
    child: {
      protocol: "TERMINATED_HTTPS",
      default_tls_container_ref: container,
      sni_container_refs: [secret, "not a Barbican ref"],
      client_authentication: "MANDATORY",
      client_ca_tls_container_ref: secret,
      client_crl_container_ref: secret,
    },
  });
  expect(markup).toContain(
    `href="/key-manager/containers/${id}">Open default certificate</a>`,
  );
  expect(markup).toContain(
    `href="/key-manager/secrets/${id}">Open SNI certificate 1</a>`,
  );
  expect(markup).toContain("External certificate 2");
  expect(markup).toContain(
    `href="/key-manager/secrets/${id}">Open client CA</a>`,
  );
  expect(markup).toContain(
    `href="/key-manager/secrets/${id}">Open client revocation list</a>`,
  );
  expect(markup).not.toContain("https://barbican.example");
});

it("uses the secret and container display names as link text when available", () => {
  const id = "aaaa1111-1111-4111-8111-111111111111";
  const markup = renderDetails({
    child: {
      protocol: "TERMINATED_HTTPS",
      default_tls_container_ref: `https://barbican.example/v1/containers/${id}`,
      client_ca_tls_container_ref: `https://barbican.example/v1/secrets/${id}`,
      client_authentication: "MANDATORY",
      client_crl_container_ref: "not a Barbican reference",
    },
    barbicanNames: {
      [`containers/${id}`]: "Edge server certificate",
      [`secrets/${id}`]: "Production client CA",
    },
  });
  expect(markup).toContain(
    `href="/key-manager/containers/${id}">Edge server certificate</a>`,
  );
  expect(markup).toContain(
    `href="/key-manager/secrets/${id}">Production client CA</a>`,
  );
  expect(markup).toContain("External revocation list reference");
});

describe("listener detail routing", () => {
  it("shows the reused routing controls without a redundant Listener column", () => {
    const markup = renderDetails({
      routing: { data: { l7Policies: [], l7Rules: [] } },
      pools: [
        {
          id: "pool",
          name: "API",
          protocol: "HTTP",
          provisioning_status: "ACTIVE",
        },
      ],
    });
    expect(markup).toContain("Create routing policy");
    expect(markup).toContain('id="l7-policies"');
    expect(markup).toContain("No L7 policies are configured.");
    expect(markup).not.toContain(">Listener</th>");
  });

  it("keeps listener settings and stats available when policy reads fail", () => {
    const markup = renderDetails({ routing: { isError: true } });
    expect(markup).toContain(
      "Listener routing policies could not be refreshed.",
    );
    expect(markup).toContain("Traffic statistics");
    expect(markup).toContain('id="l7-policies"');
    expect(markup).toContain("Edit listener");
    expect(markup).not.toContain("Create routing policy");
  });

  it("does not load an empty routing section for a TCP listener", () => {
    const markup = renderDetails({ child: { protocol: "TCP" } });
    expect(markup).not.toContain("L7 policies");
    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["routing"], enabled: false }),
    );
  });

  it("keeps checking pool choices while a new pool settles", () => {
    renderDetails();
    const poolQuery = mocks.useQuery.mock.calls.findLast(
      ([options]) => options.queryKey[0] === "pool-choices",
    )?.[0];
    expect(
      poolQuery?.refetchInterval({
        state: { data: [{ provisioning_status: "PENDING_CREATE" }] },
      }),
    ).toBe(5_000);
    expect(
      poolQuery?.refetchInterval({
        state: { data: [{ provisioning_status: "ACTIVE" }] },
      }),
    ).toBe(false);
  });
});
