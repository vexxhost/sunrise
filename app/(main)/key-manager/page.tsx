import {
  DatabaseZap,
  Package,
  ScrollText,
  ShieldCheck,
  Vault,
} from "lucide-react";

import { CreateResourceMenu } from "@/components/resources/CreateResourceMenu";
import {
  ServiceLandingPage,
  ServiceLandingSection,
  ServiceRecentResources,
  ServiceResourceGrid,
  type ServiceLandingMetric,
} from "@/components/service-landing/ServiceLanding";
import { loadCloudContext } from "@/lib/cloud-context";
import { createActionsForService } from "@/lib/create-actions";
import {
  getBarbicanQuotaSummary,
  listSecretStores,
} from "@/lib/openstack/barbican-server";

export const dynamic = "force-dynamic";

function quotaDetail(limit: number, label: string) {
  if (limit < 0) return `${label} quota is unlimited`;
  if (limit === 0) return `${label} creation is disabled`;
  return `${limit} allowed in the active project`;
}

export default async function KeyManagerPage() {
  const [{ snapshot }, quotaResult, storeResult] = await Promise.all([
    loadCloudContext(),
    getBarbicanQuotaSummary().then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    ),
    listSecretStores().then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    ),
  ]);
  const resources = [
    ...snapshot.personalResources.pinned,
    ...snapshot.personalResources.recent,
  ];
  const actions = createActionsForService(
    snapshot.createActions,
    "key-manager",
  );
  const quotas = quotaResult.ok ? quotaResult.value : null;
  const stores = storeResult.ok ? storeResult.value : null;
  const metrics: ServiceLandingMetric[] = [
    {
      icon: Vault,
      label: "Secrets",
      value: quotas ? String(quotas.usage.secrets) : "-",
      detail: quotas
        ? quotaDetail(quotas.limits.secrets, "Secret")
        : "Secret usage is unavailable",
    },
    {
      icon: Package,
      label: "Containers",
      value: quotas ? String(quotas.usage.containers) : "-",
      detail: quotas
        ? quotaDetail(quotas.limits.containers, "Container")
        : "Container usage is unavailable",
    },
    {
      icon: ScrollText,
      label: "Orders",
      value: quotas ? String(quotas.usage.orders) : "-",
      detail: quotas
        ? quotaDetail(quotas.limits.orders, "Order")
        : "Order usage is unavailable",
    },
    {
      icon: DatabaseZap,
      label: "Secret stores",
      value:
        stores?.status === "available" ? String(stores.stores.length) : "-",
      detail:
        stores?.status === "available"
          ? "Backends visible to the active project"
          : stores?.status === "forbidden"
            ? "Store discovery requires additional permission"
            : "Multiple-store support is unavailable",
    },
  ];

  return (
    <ServiceLandingPage
      title="Key Manager"
      description="Store secrets, generate keys, control project access, and inspect Barbican backends without exposing protected payloads in the console."
      context={snapshot}
      serviceId="key-manager"
      actions={<CreateResourceMenu actions={actions} />}
      metrics={metrics}
    >
      <ServiceLandingSection
        title="Quick access"
        description="Manage protected material and the resources that organize or generate it."
      >
        <ServiceResourceGrid
          resources={[
            {
              name: "Secrets",
              href: "/key-manager/secrets",
              icon: Vault,
              description:
                "Store encrypted values and manage metadata, consumers, and read access.",
              meta: quotas
                ? `${quotas.usage.secrets} visible`
                : "Usage unavailable",
              badge: quotas?.limits.secrets === 0 ? "Disabled" : "Encrypted",
              createAction: actions.find(({ id }) => id === "secret"),
            },
            {
              name: "Containers",
              href: "/key-manager/containers",
              icon: Package,
              description:
                "Group related secrets into generic, RSA, or certificate containers.",
              meta: quotas
                ? `${quotas.usage.containers} visible`
                : "Usage unavailable",
              badge: "Project scoped",
              createAction: actions.find(({ id }) => id === "secret-container"),
            },
            {
              name: "Key orders",
              href: "/key-manager/orders",
              icon: ScrollText,
              description:
                "Generate symmetric or asymmetric key material through Barbican.",
              meta: quotas
                ? `${quotas.usage.orders} visible`
                : "Usage unavailable",
              badge: "Generated securely",
              createAction: actions.find(({ id }) => id === "secret-order"),
            },
            {
              name: "Access and storage",
              href: "/key-manager/secret-stores",
              icon: ShieldCheck,
              description:
                "Inspect configured secret backends and effective project quota limits.",
              meta: "Policy aware",
              badge: "Read only",
            },
          ]}
        />
      </ServiceLandingSection>

      <ServiceRecentResources
        resources={resources}
        kinds={["secret", "secret-container", "secret-order"]}
        emptyMessage="No pinned or recently viewed Key Manager resources in this project."
      />
    </ServiceLandingPage>
  );
}
