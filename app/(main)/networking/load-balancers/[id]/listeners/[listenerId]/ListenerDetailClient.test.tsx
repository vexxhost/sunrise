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

const loadBalancerId = "11111111-1111-4111-8111-111111111111";
const listenerId = "22222222-2222-4222-8222-222222222222";
const loadBalancer = {
  id: loadBalancerId,
  name: "load-balancer",
  provider: "amphorav2",
  listeners: [{ id: listenerId }] as Array<{ id: string } | null>,
  provisioning_status: "ACTIVE",
};
const listener = {
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
}: {
  parent?: Partial<typeof loadBalancer>;
  child?: Partial<typeof listener>;
  isFetching?: boolean;
  isRefetchError?: boolean;
  routing?: Record<string, unknown>;
  pools?: Array<Record<string, unknown>>;
} = {}) {
  mocks.useQuery.mockImplementation(({ queryKey }) =>
    queryKey?.[0] === "routing" ? routing : { data: pools },
  );
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
