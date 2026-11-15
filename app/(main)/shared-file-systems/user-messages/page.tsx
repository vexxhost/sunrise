import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { userMessagesQueryOptions } from "@/hooks/queries/useManila";
import { getSession } from "@/lib/session";
import { UserMessagesClient } from "./UserMessagesClient";

export default async function UserMessagesPage() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="user message"
      queries={[userMessagesQueryOptions(session.regionId, session.projectId)]}
    >
      <UserMessagesClient
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </DataTableHydrationBoundary>
  );
}
