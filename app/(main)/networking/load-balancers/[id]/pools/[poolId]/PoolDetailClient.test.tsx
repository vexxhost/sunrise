import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useSuspenseQuery: mocks.useSuspenseQuery,
  useQueryClient: () => ({}),
}));
vi.mock("@/hooks/queries/useLoadBalancers", () => ({
  loadBalancerPoolDetailsQueryOptions: () => ({}),
  loadBalancerPoolRedirectPoliciesQueryOptions: () => ({}),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({}),
}));
vi.mock("@/components/LoadBalancer/MemberMutationDialog", () => ({
  MemberMutationDialog: () => null,
}));
vi.mock("@/components/LoadBalancer/HealthMonitorMutationDialog", () => ({
  HealthMonitorMutationDialog: () => null,
}));
vi.mock("@/components/LoadBalancer/PoolMutationDialog", () => ({
  PoolMutationDialog: () => null,
}));

import { PoolDetailClient } from "./PoolDetailClient";

const loadBalancerId = "11111111-1111-4111-8111-111111111111";
const poolId = "22222222-2222-4222-8222-222222222222";
const listenerId = "33333333-3333-4333-8333-333333333333";
const parentPath = `/networking/load-balancers/${loadBalancerId}`;
const loadBalancer = {
  id: loadBalancerId,
  name: "application",
  provider: "amphorav2",
  pools: [{ id: poolId }],
  provisioning_status: "ACTIVE",
};
const pool = {
  id: poolId,
  name: "backend",
  protocol: "HTTP",
  lb_algorithm: "ROUND_ROBIN",
  provisioning_status: "ACTIVE",
  admin_state_up: true,
  listeners: [],
  session_persistence: { type: "APP_COOKIE", cookie_name: "app_session" },
};
const monitor = {
  id: "monitor",
  name: "health",
  type: "HTTP",
  delay: 5,
  timeout: 3,
  admin_state_up: true,
  max_retries: 3,
  max_retries_down: 3,
  http_method: "GET",
  url_path: "/health",
  expected_codes: "200",
  provisioning_status: "ACTIVE",
  pools: [{ id: poolId }],
};

function renderDetail(
  overrides: Record<string, unknown> = {},
  queryState: { isFetching?: boolean; isRefetchError?: boolean } = {},
  redirects: Record<string, unknown> = { data: [] },
  barbicanNames: Record<string, string> = {},
) {
  mocks.useQuery.mockImplementation(({ queryKey }) =>
    queryKey?.[3] === "octavia-reference-names"
      ? { data: barbicanNames }
      : redirects,
  );
  mocks.useSuspenseQuery.mockReturnValue({
    ...queryState,
    data: {
      loadBalancer,
      pool,
      members: [],
      listeners: [],
      healthMonitor: null,
      ...overrides,
    },
  });
  return renderToStaticMarkup(
    <PoolDetailClient
      loadBalancerId={loadBalancerId}
      neutronAvailable
      poolId={poolId}
      regionId="RegionOne"
      projectId="project-a"
    />,
  );
}

function addMemberButton(markup: string) {
  return markup.match(
    /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Add member<\/button>/,
  )?.[0];
}

function addMonitorButton(markup: string) {
  return markup.match(
    /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Add health monitor<\/button>/,
  )?.[0];
}

function editPoolButton(markup: string) {
  return markup.match(
    /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Edit pool<\/button>/,
  )?.[0];
}

function deletePoolButton(markup: string) {
  return markup.match(
    /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Delete pool<\/button>/,
  )?.[0];
}

describe("pool details view", () => {
  it("links all configured backend TLS references directly to Key Manager", () => {
    const id = "aaaa2222-2222-4222-8222-222222222222";
    const secret = `https://barbican.example/v1/secrets/${id}`;
    const markup = renderDetail({
      pool: {
        ...pool,
        tls_enabled: true,
        ca_tls_container_ref: secret,
        tls_container_ref: `https://barbican.example/v1/containers/${id}`,
        crl_container_ref: secret,
      },
    });
    expect(markup).toContain(
      `href="/key-manager/secrets/${id}">Open member CA</a>`,
    );
    expect(markup).toContain(
      `href="/key-manager/containers/${id}">Open backend client certificate</a>`,
    );
    expect(markup).toContain(
      `href="/key-manager/secrets/${id}">Open backend revocation list</a>`,
    );
    expect(markup).not.toContain("https://barbican.example");
  });

  it("shows Barbican names on backend TLS links rather than UUIDs", () => {
    const id = "aaaa2222-2222-4222-8222-222222222222";
    const markup = renderDetail(
      {
        pool: {
          ...pool,
          tls_enabled: true,
          ca_tls_container_ref: `https://barbican.example/v1/secrets/${id}`,
        },
      },
      {},
      undefined,
      { [`secrets/${id}`]: "Backend trust CA" },
    );
    expect(markup).toContain(
      `href="/key-manager/secrets/${id}">Backend trust CA</a>`,
    );
    expect(markup).not.toContain(`>${id}</a>`);
  });

  it("offers deletion and loads redirect dependencies for a settled pool", () => {
    const button = deletePoolButton(renderDetail());
    expect(button).toBeDefined();
    expect(button).not.toContain(' disabled=""');
    expect(mocks.useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("shows policies independently from default listeners and links only verified owners", () => {
    const markup = renderDetail(
      {},
      {},
      {
        data: [
          {
            id: "policy-a",
            name: "API path",
            position: 1,
            admin_state_up: false,
            provisioning_status: "ACTIVE",
            listener_id: listenerId,
            listener: { id: listenerId, name: "web" },
          },
          {
            id: "policy-b",
            name: "Other path",
            position: 2,
            admin_state_up: true,
            listener_id: "unverified-id",
            listener: null,
          },
        ],
      },
    );
    expect(markup).toContain("None attached");
    expect(markup).toContain("API path");
    expect(markup).toContain("Disabled");
    expect(markup).toContain(
      `href="${parentPath}/listeners/${listenerId}#l7-policies"`,
    );
    expect(markup).toContain("unverified-id");
    expect(markup).not.toContain("listeners/unverified-id");
  });

  it("does not imply an empty redirect list when the read fails", () => {
    const markup = renderDetail({}, {}, { isError: true });
    expect(markup).toContain("L7 redirects are unavailable.");
    expect(markup).not.toContain("No L7 policies target");
    expect(markup).toContain("No members configured.");
  });
  it("shows configured persistence, an IPv6 member, the monitor, and verified links", () => {
    const markup = renderDetail({
      members: [
        {
          id: "member",
          address: "2001:db8::1",
          protocol_port: 8080,
          monitor_address: "2001:db8::2",
          monitor_port: null,
          weight: 0,
          provisioning_status: "ACTIVE",
        },
      ],
      listeners: [{ id: listenerId, name: "web" }],
      healthMonitor: {
        id: "monitor",
        type: "HTTP",
        delay: 5,
        http_version: 1.1,
        domain_name: "health.example.test",
        timeout: 3,
        url_path: "/health",
        expected_codes: "200",
      },
    });
    expect(markup).toContain("app_session");
    expect(markup).toContain("[2001:db8::1]:8080");
    expect(markup).toContain("Health check:");
    expect(markup).toContain("[2001:db8::2]:8080");
    expect(markup).toContain("/health");
    expect(markup).toContain("HTTP/1.1");
    expect(markup).toContain("health.example.test");
    expect(markup).toContain(`href="${parentPath}/listeners/${listenerId}"`);
    expect(markup).toContain(`href="${parentPath}#pools"`);
    expect(markup).toContain('aria-label="Edit member member"');
    expect(markup).toContain('aria-label="Remove member member"');
    expect(addMemberButton(markup)).toBeDefined();
    expect(addMemberButton(markup)).not.toContain(' disabled=""');
  });

  it("shows reported backup and primary roles only for supported pools", () => {
    const members = [
      { id: "backup", address: "192.0.2.10", protocol_port: 80, backup: true },
      {
        id: "primary",
        address: "192.0.2.11",
        protocol_port: 80,
        backup: false,
      },
      { id: "unknown", address: "192.0.2.12", protocol_port: 80 },
    ];
    const supported = renderDetail({ backupMembersSupported: true, members });
    expect(supported).toContain(">Role</th>");
    expect(supported).toContain(">Backup</td>");
    expect(supported).toContain(">Primary</td>");
    expect(supported.match(/>Primary<\/td>/g)).toHaveLength(1);
    expect(
      renderDetail({ backupMembersSupported: false, members }),
    ).not.toContain(">Role</th>");
  });

  it("distinguishes empty resources from unavailable child data", () => {
    const empty = renderDetail();
    expect(empty).toContain("No L7 policies target this pool.");
    expect(empty).toContain("No health monitor configured.");
    expect(empty).toContain("No members configured.");
    const unavailable = renderDetail({
      pool: {
        id: poolId,
        lb_algorithm: "ROUND_ROBIN",
        healthmonitor_id: "monitor",
      },
      members: null,
      listeners: [null],
    });
    expect(unavailable).toContain("Health monitor details are unavailable.");
    expect(unavailable).toContain("Member details are unavailable.");
    expect(unavailable).toContain("Some listener details are unavailable.");
  });

  it("does not offer pool edit or member controls for an unsupported provider", () => {
    const markup = renderDetail({
      loadBalancer: { ...loadBalancer, provider: "ovn" },
    });
    expect(addMemberButton(markup)).toBeUndefined();
    expect(editPoolButton(markup)).toBeUndefined();
    expect(deletePoolButton(markup)).toBeUndefined();
  });

  it.each([{ pools: [] }, { provisioning_status: "PENDING_UPDATE" }])(
    "disables edits when the parent no longer verifies the active pool: %j",
    (parentChanges) => {
      const markup = renderDetail({
        loadBalancer: { ...loadBalancer, ...parentChanges },
      });
      expect(addMemberButton(markup)).toContain(' disabled=""');
      expect(editPoolButton(markup)).toContain(' disabled=""');
      expect(deletePoolButton(markup)).toContain(' disabled=""');
    },
  );

  it("disables new members while details are refreshing, stale, or unavailable", () => {
    expect(addMemberButton(renderDetail({}, { isFetching: true }))).toContain(
      ' disabled=""',
    );
    expect(
      addMemberButton(renderDetail({}, { isRefetchError: true })),
    ).toContain(' disabled=""');
    expect(addMemberButton(renderDetail({ members: null }))).toContain(
      ' disabled=""',
    );
  });

  it.each(["ACTIVE", "ERROR", "PENDING_UPDATE"])(
    "gates pool editing for pool provisioning status %s, independent of member details",
    (provisioning_status) => {
      const markup = renderDetail({
        pool: { ...pool, provisioning_status },
        members: null,
      });
      const edit = editPoolButton(markup);
      expect(edit).toBeDefined();
      expect(edit?.includes(' disabled=""')).toBe(
        provisioning_status === "PENDING_UPDATE",
      );
      expect(deletePoolButton(markup)?.includes(' disabled=""')).toBe(
        provisioning_status === "PENDING_UPDATE",
      );
    },
  );

  it.each([{ isFetching: true }, { isRefetchError: true }])(
    "disables pool editing until current details are available: %j",
    (queryState) => {
      const markup = renderDetail({}, queryState);
      expect(editPoolButton(markup)).toContain(' disabled=""');
      expect(deletePoolButton(markup)).toContain(' disabled=""');
    },
  );

  it("adds monitors only for supported providers and pools with no monitor reference", () => {
    expect(addMonitorButton(renderDetail())).toBeDefined();
    expect(addMonitorButton(renderDetail())).not.toContain(' disabled=""');
    expect(
      addMonitorButton(renderDetail({}, { isRefetchError: true })),
    ).toContain(' disabled=""');
    expect(
      addMonitorButton(
        renderDetail({ pool: { ...pool, healthmonitor_id: monitor.id } }),
      ),
    ).toBeUndefined();
    expect(
      addMonitorButton(renderDetail({ pool: { ...pool, protocol: "SCTP" } })),
    ).toBeUndefined();
    expect(
      addMonitorButton(
        renderDetail({ loadBalancer: { ...loadBalancer, provider: "ovn" } }),
      ),
    ).toBeUndefined();
  });

  it("allows UDP-CONNECT monitors on Amphora UDP pools", () => {
    const udp = { ...pool, protocol: "UDP", session_persistence: null };
    const empty = addMonitorButton(renderDetail({ pool: udp }));
    expect(empty).toBeDefined();
    expect(empty).not.toContain(' disabled=""');
    const configured = renderDetail({
      pool: { ...udp, healthmonitor_id: monitor.id },
      healthMonitor: { ...monitor, type: "UDP-CONNECT" },
    });
    expect(configured).toContain("UDP-CONNECT");
    expect(configured).toContain('aria-label="Edit health monitor"');
    expect(configured).toContain('aria-label="Delete health monitor"');
  });

  it.each(["ACTIVE", "ERROR", "PENDING_UPDATE"])(
    "gates edit and delete for monitor provisioning status %s",
    (provisioning_status) => {
      const markup = renderDetail({
        pool: { ...pool, healthmonitor_id: monitor.id },
        healthMonitor: { ...monitor, provisioning_status },
      });
      const edit = markup.match(
        /<button\b[^>]*aria-label="Edit health monitor"[^>]*>/,
      )?.[0];
      const remove = markup.match(
        /<button\b[^>]*aria-label="Delete health monitor"[^>]*>/,
      )?.[0];
      expect(edit).toBeDefined();
      expect(remove).toBeDefined();
      expect(edit?.includes(' disabled=""')).toBe(
        provisioning_status !== "ACTIVE",
      );
      expect(remove?.includes(' disabled=""')).toBe(
        provisioning_status === "PENDING_UPDATE",
      );
    },
  );
});
