import { ServiceAvailabilityPage } from "@/components/service-landing/ServiceLanding";
import { loadCloudContext } from "@/lib/cloud-context";

export default async function FileSystemPage() {
  const { snapshot } = await loadCloudContext();

  return (
    <ServiceAvailabilityPage
      title="File System"
      description="Manage shared file system storage and shares with OpenStack Manila."
      context={snapshot}
      serviceId="file-system"
      resourceLabel="Manila"
    />
  );
}
