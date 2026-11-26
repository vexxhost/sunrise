import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useSuspenseQuery: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({}),
  useSuspenseQuery: mocks.useSuspenseQuery,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/hooks/queries/useLoadBalancers", () => ({
  loadBalancerListenerDetailsQueryOptions: () => ({}),
  loadBalancerPoolChoicesQueryOptions: () => ({}),
}));
vi.mock("@/components/LoadBalancer/ListenerMutationDialog", () => ({
  ListenerMutationDialog: () => null,
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
}: {
  parent?: Partial<typeof loadBalancer>;
  child?: Partial<typeof listener>;
  isFetching?: boolean;
  isRefetchError?: boolean;
} = {}) {
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
