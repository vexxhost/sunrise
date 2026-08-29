import { ServiceAvailabilityPage } from "@/components/service-landing/ServiceLanding";
import { loadCloudContext } from "@/lib/cloud-context";

export default async function OrchestrationPage() {
  const { snapshot } = await loadCloudContext();

  return (
    <ServiceAvailabilityPage
      title="Orchestration"
      description="Deploy and manage template-based infrastructure with OpenStack Heat."
      context={snapshot}
      serviceId="orchestration"
      resourceLabel="Heat"
    />
  );
}
