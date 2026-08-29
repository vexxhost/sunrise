import { ServiceAvailabilityPage } from "@/components/service-landing/ServiceLanding";
import { loadCloudContext } from "@/lib/cloud-context";

export default async function DNSPage() {
  const { snapshot } = await loadCloudContext();

  return (
    <ServiceAvailabilityPage
      title="DNS"
      description="Manage DNS zones and domain records with OpenStack Designate."
      context={snapshot}
      serviceId="dns"
      resourceLabel="Designate"
    />
  );
}
