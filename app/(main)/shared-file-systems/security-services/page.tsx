import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { SecurityServiceActions } from "@/components/SharedFileSystem/SecurityServiceActions";
import { securityServicesQueryOptions } from "@/hooks/queries/useManila";
import { isCreateActionRequested } from "@/lib/create-actions";
import { getSession } from "@/lib/session";
import { SecurityServicesClient } from "./SecurityServicesClient";

export default async function SecurityServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "security-service",
  );

  return (
    <DataTableHydrationBoundary
      resourceName="security service"
      actions={
        <SecurityServiceActions
          key={createRequested ? "create" : "idle"}
          initiallyOpen={createRequested}
          projectId={session.projectId}
          regionId={session.regionId}
        />
      }
      queries={[
        securityServicesQueryOptions(session.regionId, session.projectId),
      ]}
    >
      <SecurityServicesClient
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </DataTableHydrationBoundary>
  );
}
