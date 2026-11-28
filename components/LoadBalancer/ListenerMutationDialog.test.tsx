import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn(() => ({ data: [] })) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/hooks/queries/useLoadBalancers", () => ({
  loadBalancerPoolChoicesQueryOptions: () => ({ queryKey: ["pools"] }),
}));
vi.mock("@/hooks/queries/useQuotas", () => ({
  useProjectQuotaImpact: () => ({ issues: [] }),
}));
vi.mock("@/lib/openstack/octavia-actions", () => ({
  listOctaviaTlsSecretsAction: vi.fn(),
  mutateLoadBalancerListenerAction: vi.fn(),
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

import { ListenerMutationDialog } from "./ListenerMutationDialog";

const scope = { projectId: "project-a", regionId: "RegionOne" };
const secretId = "612b9ffa-fbc9-42ea-a78f-600c003c5103";
const active = {
  project_id: scope.projectId,
  provisioning_status: "ACTIVE",
  operating_status: "OFFLINE",
  admin_state_up: false,
};

function renderEdit(defaultRef: string | null | undefined) {
  return renderToStaticMarkup(
    <ListenerMutationDialog
      target={{
        action: "edit",
        listener: {
          ...active,
          id: "listener",
          name: "web",
          protocol: "TERMINATED_HTTPS",
          protocol_port: 443,
          default_tls_container_ref: defaultRef,
          sni_container_refs: [
            `https://barbican.example.test/v1/secrets/${secretId}`,
          ],
        },
      }}
      loadBalancer={{
        ...active,
        id: "load-balancer",
        name: "web-lb",
        provider: "amphorav2",
      }}
      capabilities={{
        serviceType: "load-balancer",
        discoveryStatus: "unavailable",
        message: "",
      }}
      scope={scope}
      onClose={() => {}}
      onSuccess={() => {}}
    />,
  );
}

describe("SNI-only listener editing", () => {
  it("renders SNI controls and loads certificate choices without a default certificate", () => {
    const markup = renderEdit(null);
    expect(markup).toContain("Add SNI certificate");
    expect(markup).toContain(`Remove SNI certificate ${secretId}`);
    expect(markup).not.toContain("Replacement certificate");
    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: [scope.regionId, scope.projectId, "octavia", "tls-secrets"],
      }),
    );
  });

  it("does not offer SNI edits when the default certificate state was not reported", () => {
    expect(renderEdit(undefined)).not.toContain("Add SNI certificate");
  });
});
