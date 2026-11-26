import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useProjectQuotaImpact: vi.fn(),
}));

vi.mock("@/hooks/queries/useQuotas", () => ({
  useProjectQuotaImpact: mocks.useProjectQuotaImpact,
}));
vi.mock("@/lib/openstack/octavia-actions", () => ({
  mutateLoadBalancerPoolAction: vi.fn(),
}));
vi.mock("@/components/ui/dialog", () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    Dialog: Container,
    DialogContent: Container,
    DialogDescription: Container,
    DialogFooter: Container,
    DialogHeader: Container,
    DialogTitle: Container,
  };
});

import {
  PoolMutationDialog,
  type PoolDialogAction,
} from "@/components/LoadBalancer/PoolMutationDialog";
import type { OctaviaL7Policy, OctaviaPool } from "@/types/openstack";

const poolId = "22222222-2222-4222-8222-222222222222";

function renderDialog(
  target: PoolDialogAction,
  l7Policies: OctaviaL7Policy[] = [],
) {
  return renderToStaticMarkup(
    <PoolMutationDialog
      {...(target.action === "create"
        ? {
            target,
            creation: {
              provider: "amphorav2",
              capabilities: {
                discoveryStatus: "available" as const,
                message: "",
                microversions: { minimum: "2.0", maximum: "2.30" },
                serviceType: "load-balancer" as const,
              },
              listeners: [],
            },
          }
        : target.action === "delete"
          ? { target, l7Policies }
          : { target })}
      loadBalancerId="11111111-1111-4111-8111-111111111111"
      scope={{ projectId: "project-a", regionId: "RegionOne" }}
      onClose={() => {}}
      onRefresh={() => {}}
      onSuccess={() => {}}
    />,
  );
}

describe("Octavia pool dialog", () => {
  beforeEach(() => {
    mocks.useProjectQuotaImpact.mockReturnValue({
      impacts: [],
      issues: [],
      loading: false,
    });
  });

  it("disables creation when the known quota is exhausted", () => {
    mocks.useProjectQuotaImpact.mockReturnValue({
      impacts: [],
      issues: ["Pools: project quota exceeded."],
      loading: false,
    });
    const markup = renderDialog({ action: "create" });
    expect(markup).toContain("Pools: project quota exceeded.");
    expect(markup.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0]).toContain(
      ' disabled=""',
    );
  });

  it("leaves submission available when quota cannot be read", () => {
    mocks.useProjectQuotaImpact.mockReturnValue({
      impacts: [],
      issues: [],
      loading: false,
      unavailableMessage: "OpenStack will validate the request.",
    });
    const markup = renderDialog({ action: "create" });
    const submit = markup.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0];
    expect(submit).toBeDefined();
    expect(submit).not.toContain(' disabled=""');
  });

  const editablePool: OctaviaPool = {
    id: poolId,
    name: "backend",
    project_id: "project-a",
    protocol: "HTTP",
    provisioning_status: "ACTIVE",
    operating_status: "OFFLINE",
    admin_state_up: false,
    lb_algorithm: "ROUND_ROBIN",
  };

  it("loads the configured cookie name without marking an edit dirty", () => {
    const markup = renderDialog({
      action: "edit",
      pool: {
        ...editablePool,
        session_persistence: { type: "APP_COOKIE", cookie_name: "app_session" },
      },
    });
    expect(markup).toContain("Session persistence");
    expect(
      markup.match(/<input\b[^>]*id="pool-cookie-name"[^>]*>/)?.[0],
    ).toContain('value="app_session"');
    expect(markup.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0]).toContain(
      ' disabled=""',
    );
  });

  it("does not offer cookie settings for an existing pool on an unsupported protocol", () => {
    const markup = renderDialog({
      action: "edit",
      pool: {
        ...editablePool,
        protocol: "PROXY",
        session_persistence: { type: "APP_COOKIE", cookie_name: "app_session" },
      },
    });
    expect(markup).toContain("App cookie");
    expect(markup).not.toContain('id="pool-session-persistence"');
    expect(markup).not.toContain('id="pool-cookie-name"');
  });

  it("shows the L7 dependency and blocks confirmation for an empty pool", () => {
    const markup = renderDialog(
      {
        action: "delete",
        pool: {
          id: poolId,
          name: "backend",
          project_id: "project-a",
          protocol: "HTTP",
          provisioning_status: "ACTIVE",
          operating_status: "OFFLINE",
          admin_state_up: false,
          lb_algorithm: "ROUND_ROBIN",
          listeners: [],
          members: [],
        },
      },
      [
        {
          id: "policy-a",
          name: "redirect",
          project_id: "project-a",
          listener_id: "listener-a",
          action: "REDIRECT_TO_POOL",
          redirect_pool_id: poolId,
          admin_state_up: false,
          position: 1,
          operating_status: "OFFLINE",
          provisioning_status: "ACTIVE",
        },
      ],
    );
    expect(markup).toContain("Remove or retarget the L7 policies");
    expect(markup).toMatch(
      /<button\b[^>]* disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Delete pool<\/button>/,
    );
  });
});
