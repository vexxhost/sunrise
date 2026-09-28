import {
  Clock3,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { CreateResourceMenu } from "@/components/resources/CreateResourceMenu";
import {
  ServiceLandingPage,
  ServiceLandingSection,
  ServiceResourceGrid,
  type ServiceLandingMetric,
} from "@/components/service-landing/ServiceLanding";
import { createActionsForService } from "@/lib/create-actions";
import { loadCloudContext } from "@/lib/cloud-context";
import { listApplicationCredentialsAction } from "@/lib/openstack/application-credentials";
import { normalizeOpenStackTimestamp } from "@/lib/openstack/time";

export const dynamic = "force-dynamic";

export default async function IdentityPage() {
  const [cloud, data] = await Promise.all([
    loadCloudContext(),
    listApplicationCredentialsAction(),
  ]);
  const { snapshot } = cloud;
  const expiring = data.credentials.filter(({ expires_at }) => {
    if (!expires_at) return false;
    const expires = Date.parse(normalizeOpenStackTimestamp(expires_at));
    return (
      expires > data.observedAt &&
      expires - data.observedAt <= 30 * 24 * 60 * 60 * 1_000
    );
  }).length;
  const restricted = data.credentials.filter(
    ({ access_rules }) => access_rules.length > 0,
  ).length;
  const unrestricted = data.credentials.filter(
    ({ unrestricted: permitsDelegation }) => permitsDelegation,
  ).length;
  const metrics: ServiceLandingMetric[] = [
    {
      icon: KeyRound,
      label: "Credentials",
      value: String(data.credentials.length),
      detail: "Application credentials in the active project",
    },
    {
      icon: Clock3,
      label: "Expiring soon",
      value: String(expiring),
      detail: "Credentials expiring within 30 days",
    },
    {
      icon: ShieldCheck,
      label: "Access restricted",
      value: String(restricted),
      detail: "Credentials with API access rules",
    },
    {
      icon: ShieldAlert,
      label: "Delegation allowed",
      value: String(unrestricted),
      detail: "Credentials allowed to delegate access",
    },
  ];
  const createActions = createActionsForService(
    snapshot.createActions,
    "identity",
  );
  const createAction = createActions[0];

  return (
    <ServiceLandingPage
      title="Identity"
      description="Create project-scoped credentials for automation and review their effective access."
      context={snapshot}
      serviceId="identity"
      actions={<CreateResourceMenu actions={createActions} />}
      metrics={metrics}
    >
      <ServiceLandingSection
        title="Quick access"
        description="Manage non-interactive access for the active project."
      >
        <ServiceResourceGrid
          resources={[
            {
              name: "Application Credentials",
              href: "/identity/application-credentials",
              icon: KeyRound,
              description:
                "Create, inspect, rotate, and revoke credentials for OpenStack API clients.",
              meta: `${data.credentials.length} in this project`,
              createAction,
            },
          ]}
        />
      </ServiceLandingSection>
    </ServiceLandingPage>
  );
}
